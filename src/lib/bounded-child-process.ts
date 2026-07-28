import { spawn } from "node:child_process";

const TERMINATION_GRACE_MS = 1_000;
const WINDOWS_POST_KILL_SETTLE_MS = 1_000;
const LINUX_PROCESS_GROUP_POLL_MS = 25;
const MAX_ARGUMENT_COUNT = 128;
const MAX_ARGUMENT_BYTES = 8_192;

export type BoundedChildProcessErrorCode =
  | "aborted"
  | "timed_out"
  | "stdout_limit_exceeded"
  | "stderr_limit_exceeded"
  | "spawn_failed"
  | "process_failed";

const SAFE_ERROR_MESSAGES: Record<BoundedChildProcessErrorCode, string> = {
  aborted: "Child process request was aborted",
  timed_out: "Child process timed out",
  stdout_limit_exceeded: "Child process stdout limit exceeded",
  stderr_limit_exceeded: "Child process stderr limit exceeded",
  spawn_failed: "Child process failed to start",
  process_failed: "Child process failed",
};

export class BoundedChildProcessError extends Error {
  readonly code: BoundedChildProcessErrorCode;

  constructor(code: BoundedChildProcessErrorCode) {
    super(SAFE_ERROR_MESSAGES[code]);
    this.name = "BoundedChildProcessError";
    this.code = code;
  }
}

export type BoundedChildProcessOptions = {
  /** Trusted server-owned executable path. A shell is never invoked. */
  command: string;
  /** Trusted argument vector. Values are copied before spawn and never concatenated. */
  args: readonly string[];
  timeoutMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  cwd?: string;
  signal?: AbortSignal;
};

export type BoundedChildProcessResult = {
  stdout: Buffer;
};

function requirePositiveSafeInteger(name: string, value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function validateCommand(command: string) {
  if (
    typeof command !== "string" ||
    command.length === 0 ||
    Buffer.byteLength(command) > MAX_ARGUMENT_BYTES ||
    command.includes("\0")
  ) {
    throw new TypeError(
      "command must be a bounded non-empty string without null bytes",
    );
  }
}

function copyAndValidateArguments(args: readonly string[]) {
  if (!Array.isArray(args) || args.length > MAX_ARGUMENT_COUNT) {
    throw new TypeError("args must be a bounded string array");
  }
  return args.map((argument) => {
    if (
      typeof argument !== "string" ||
      Buffer.byteLength(argument) > MAX_ARGUMENT_BYTES ||
      argument.includes("\0")
    ) {
      throw new TypeError(
        "each child process argument must be a bounded string without null bytes",
      );
    }
    return argument;
  });
}

function isLinuxProcessGroupAlive(processId: number | undefined) {
  if (process.platform !== "linux" || !processId) return false;
  try {
    process.kill(-processId, 0);
    return true;
  } catch (error) {
    // ESRCH is the only result that proves the process group is absent.
    // EPERM and unknown probe failures must fail closed.
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

function signalChildTree(
  child: ReturnType<typeof spawn>,
  signal: NodeJS.Signals,
) {
  const processId = child.pid;
  if (process.platform === "linux" && processId) {
    try {
      process.kill(-processId, signal);
      return true;
    } catch {
      return false;
    }
  }

  try {
    return child.kill(signal);
  } catch {
    return false;
  }
}

/**
 * Executes one trusted command without a shell and bounds both output streams.
 * Failures expose only stable categories; stderr, command lines, and driver
 * messages are deliberately excluded from rejected errors.
 *
 * Linux children run in a dedicated process group. The promise does not settle
 * until the leader has closed and the group is confirmed absent. On Windows
 * and other platforms, Node's native kill only targets the leaf process; that
 * termination path is intentionally best-effort and never invokes taskkill.
 */
export function runBoundedChildProcess(
  options: BoundedChildProcessOptions,
): Promise<BoundedChildProcessResult>;
export function runBoundedChildProcess(
  options: BoundedChildProcessOptions,
  spawnChild: typeof spawn = spawn,
): Promise<BoundedChildProcessResult> {
  validateCommand(options.command);
  const args = copyAndValidateArguments(options.args);
  requirePositiveSafeInteger("timeoutMs", options.timeoutMs);
  requirePositiveSafeInteger("maxStdoutBytes", options.maxStdoutBytes);
  requirePositiveSafeInteger("maxStderrBytes", options.maxStderrBytes);
  if (
    options.cwd !== undefined &&
    (typeof options.cwd !== "string" ||
      options.cwd.length === 0 ||
      options.cwd.includes("\0"))
  ) {
    throw new TypeError("cwd must be a non-empty string without null bytes");
  }
  if (options.signal?.aborted) {
    return Promise.reject(new BoundedChildProcessError("aborted"));
  }

  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawnChild(options.command, args, {
        cwd: options.cwd,
        detached: process.platform === "linux",
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch {
      reject(new BoundedChildProcessError("spawn_failed"));
      return;
    }

    const processId = child.pid;
    const stdoutChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let closeObserved = false;
    let closeExitCode: number | null = null;
    let closeExitSignal: NodeJS.Signals | null = null;
    let pendingFailure: BoundedChildProcessError | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let killTimer: ReturnType<typeof setTimeout> | null = null;
    let postKillTimer: ReturnType<typeof setTimeout> | null = null;
    let linuxGroupProbeTimer: ReturnType<typeof setTimeout> | null = null;

    const abortHandler = () => {
      beginTermination(new BoundedChildProcessError("aborted"));
    };

    const cleanup = () => {
      if (timeoutTimer !== null) clearTimeout(timeoutTimer);
      if (killTimer !== null) clearTimeout(killTimer);
      if (postKillTimer !== null) clearTimeout(postKillTimer);
      if (linuxGroupProbeTimer !== null) clearTimeout(linuxGroupProbeTimer);
      options.signal?.removeEventListener("abort", abortHandler);
    };

    const settleFailure = (error: BoundedChildProcessError) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const settleSuccess = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ stdout: Buffer.concat(stdoutChunks, stdoutBytes) });
    };

    const scheduleLinuxGroupProbe = () => {
      if (
        settled ||
        process.platform !== "linux" ||
        linuxGroupProbeTimer !== null
      ) {
        return;
      }
      linuxGroupProbeTimer = setTimeout(() => {
        linuxGroupProbeTimer = null;
        inspectLifecycle();
      }, LINUX_PROCESS_GROUP_POLL_MS);
    };

    function inspectLifecycle() {
      if (settled) return;

      if (process.platform === "linux") {
        const groupAlive = isLinuxProcessGroupAlive(processId);
        if (groupAlive) {
          const graceExpired = pendingFailure !== null && killTimer === null;
          const leaderExitedWithoutFailure =
            closeObserved && pendingFailure === null;
          if (graceExpired || leaderExitedWithoutFailure) {
            signalChildTree(child, "SIGKILL");
          }
          if (closeObserved || graceExpired) scheduleLinuxGroupProbe();
          return;
        }

        if (!closeObserved) {
          // A SIGKILL may remove the group just before Node emits close.
          // Keep the event loop alive until both parts of the contract hold.
          if (pendingFailure !== null && killTimer === null) {
            scheduleLinuxGroupProbe();
          }
          return;
        }
      } else if (!closeObserved) {
        return;
      }

      if (pendingFailure) {
        settleFailure(pendingFailure);
        return;
      }

      if (closeExitCode === 0 && closeExitSignal === null) settleSuccess();
      else settleFailure(new BoundedChildProcessError("process_failed"));
    }

    function beginTermination(error: BoundedChildProcessError) {
      if (settled || pendingFailure) return;
      pendingFailure = error;
      signalChildTree(child, "SIGTERM");
      killTimer = setTimeout(() => {
        killTimer = null;
        signalChildTree(child, "SIGKILL");

        if (process.platform === "linux") {
          inspectLifecycle();
          return;
        }

        if (closeObserved) {
          inspectLifecycle();
          return;
        }

        // Windows has no process-group primitive in Node. After both native
        // termination attempts, settle as a documented leaf-process best effort.
        postKillTimer = setTimeout(
          () => settleFailure(pendingFailure ?? error),
          WINDOWS_POST_KILL_SETTLE_MS,
        );
        postKillTimer.unref?.();
      }, TERMINATION_GRACE_MS);
      killTimer.unref?.();
    }

    const streamErrorHandler = () => {
      beginTermination(new BoundedChildProcessError("process_failed"));
    };

    child.stdout!.once("error", streamErrorHandler);
    child.stdout!.on("data", (value: Buffer | string) => {
      if (settled || pendingFailure) return;
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      const nextBytes = stdoutBytes + chunk.byteLength;
      if (nextBytes > options.maxStdoutBytes) {
        beginTermination(new BoundedChildProcessError("stdout_limit_exceeded"));
        return;
      }
      stdoutBytes = nextBytes;
      stdoutChunks.push(chunk);
    });

    child.stderr!.once("error", streamErrorHandler);
    child.stderr!.on("data", (value: Buffer | string) => {
      if (settled || pendingFailure) return;
      const chunkBytes = Buffer.isBuffer(value)
        ? value.byteLength
        : Buffer.byteLength(value);
      stderrBytes += chunkBytes;
      if (stderrBytes > options.maxStderrBytes) {
        beginTermination(new BoundedChildProcessError("stderr_limit_exceeded"));
      }
    });

    child.once("error", () => {
      if (settled) return;
      if (pendingFailure) return;
      if (!child.pid) {
        settleFailure(new BoundedChildProcessError("spawn_failed"));
        return;
      }
      beginTermination(new BoundedChildProcessError("process_failed"));
    });

    child.once("close", (exitCode, exitSignal) => {
      closeObserved = true;
      closeExitCode = exitCode;
      closeExitSignal = exitSignal;
      inspectLifecycle();
    });

    timeoutTimer = setTimeout(() => {
      beginTermination(new BoundedChildProcessError("timed_out"));
    }, options.timeoutMs);
    timeoutTimer.unref?.();

    options.signal?.addEventListener("abort", abortHandler, { once: true });
    if (options.signal?.aborted) abortHandler();
  });
}
