import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

export type AttachmentOfficeKind = "docx" | "xlsx";

export type AttachmentOfficeWorkerErrorCode =
  | "invalid_request"
  | "aborted"
  | "timeout"
  | "parse_failed"
  | "worker_failed"
  | "protocol_error";

export type AttachmentOfficeWorkerOptions = {
  signal?: AbortSignal;
  /**
   * Absolute Unix timestamp in milliseconds. The worker is always capped by
   * ATTACHMENT_OFFICE_WORKER_TIMEOUT_MS even when the caller has more budget.
   */
  deadlineAt?: number;
};

export const ATTACHMENT_OFFICE_WORKER_TIMEOUT_MS = 30_000;
export const ATTACHMENT_OFFICE_OUTPUT_MAX_CHARS = 12_000;
export const ATTACHMENT_OFFICE_WORKER_RESOURCE_LIMITS = Object.freeze({
  maxOldGenerationSizeMb: 128,
  maxYoungGenerationSizeMb: 32,
  stackSizeMb: 4,
});

const ERROR_MESSAGES: Readonly<
  Record<AttachmentOfficeWorkerErrorCode, string>
> = {
  invalid_request: "Office worker request is invalid",
  aborted: "Office worker request was aborted",
  timeout: "Office worker deadline exceeded",
  parse_failed: "Office document parsing failed",
  worker_failed: "Office worker failed",
  protocol_error: "Office worker returned an invalid response",
};

const OFFICE_WORKER_URL = pathToFileURL(
  resolvePath(process.cwd(), "scripts", "attachment-office-worker.mjs"),
);

type OfficeWorkerSuccessMessage = {
  type: "result";
  ok: true;
  output: string;
};

type OfficeWorkerFailureMessage = {
  type: "result";
  ok: false;
  error: "parse_failed";
};

type OfficeWorkerMessage =
  | OfficeWorkerSuccessMessage
  | OfficeWorkerFailureMessage;

type OfficeWorkerOutcome =
  | { output: string }
  | { error: AttachmentOfficeWorkerError };

export class AttachmentOfficeWorkerError extends Error {
  readonly code: AttachmentOfficeWorkerErrorCode;

  constructor(code: AttachmentOfficeWorkerErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "AttachmentOfficeWorkerError";
    this.code = code;
  }
}

function isAttachmentOfficeKind(value: unknown): value is AttachmentOfficeKind {
  return value === "docx" || value === "xlsx";
}

function isOfficeWorkerMessage(value: unknown): value is OfficeWorkerMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  if (message.type !== "result" || typeof message.ok !== "boolean")
    return false;
  if (message.ok) {
    return typeof message.output === "string";
  }
  return message.error === "parse_failed";
}

function resolveWorkerDeadline(deadlineAt: number | undefined) {
  const now = Date.now();
  if (deadlineAt !== undefined && !Number.isFinite(deadlineAt)) {
    throw new AttachmentOfficeWorkerError("invalid_request");
  }
  if (deadlineAt !== undefined && deadlineAt <= now) {
    throw new AttachmentOfficeWorkerError("timeout");
  }

  return Math.min(
    now + ATTACHMENT_OFFICE_WORKER_TIMEOUT_MS,
    deadlineAt ?? Number.POSITIVE_INFINITY,
  );
}

function ownedArrayBuffer(buffer: Buffer) {
  const copy = Uint8Array.from(buffer);
  return copy.buffer;
}

/**
 * Parses one Office document in a memory-constrained, terminable worker.
 *
 * The caller's Buffer is copied before transfer so terminating the worker can
 * never detach a pooled Buffer that is still owned by the request process.
 * Every outcome is delivered only after the worker has exited or terminate()
 * has settled, so upstream concurrency slots reflect the real resource lifetime.
 */
export async function parseOfficeAttachmentInWorker(
  kind: AttachmentOfficeKind,
  buffer: Buffer,
  options: AttachmentOfficeWorkerOptions = {},
): Promise<string> {
  if (!isAttachmentOfficeKind(kind) || !Buffer.isBuffer(buffer)) {
    throw new AttachmentOfficeWorkerError("invalid_request");
  }
  if (options.signal?.aborted) {
    throw new AttachmentOfficeWorkerError("aborted");
  }

  const workerDeadlineAt = resolveWorkerDeadline(options.deadlineAt);
  const payload = ownedArrayBuffer(buffer);
  if (Date.now() >= workerDeadlineAt) {
    throw new AttachmentOfficeWorkerError("timeout");
  }

  let worker: Worker;
  try {
    worker = new Worker(OFFICE_WORKER_URL, {
      name: `attachment-${kind}-parser`,
      workerData: { kind, payload },
      transferList: [payload],
      resourceLimits: ATTACHMENT_OFFICE_WORKER_RESOURCE_LIMITS,
    });
  } catch {
    throw new AttachmentOfficeWorkerError("worker_failed");
  }

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let stopping = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanupBudget = () => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      options.signal?.removeEventListener("abort", onAbort);
    };
    const cleanupWorkerListeners = () => {
      worker.off("message", onMessage);
      worker.off("error", onError);
      worker.off("exit", onExit);
    };
    const deliver = (outcome: OfficeWorkerOutcome) => {
      if (settled) return;
      settled = true;
      cleanupBudget();
      cleanupWorkerListeners();
      if ("output" in outcome) resolve(outcome.output);
      else reject(outcome.error);
    };
    const terminateAndDeliver = (outcome: OfficeWorkerOutcome) => {
      if (settled || stopping) return;
      stopping = true;
      cleanupBudget();

      void worker
        .terminate()
        .catch(() => undefined)
        .then(() => deliver(outcome));
    };
    const rejectAfterTermination = (code: AttachmentOfficeWorkerErrorCode) => {
      terminateAndDeliver({ error: new AttachmentOfficeWorkerError(code) });
    };
    const onAbort = () => rejectAfterTermination("aborted");
    const onMessage = (message: unknown) => {
      if (!isOfficeWorkerMessage(message)) {
        rejectAfterTermination("protocol_error");
        return;
      }
      if (!message.ok) {
        rejectAfterTermination("parse_failed");
        return;
      }
      if (message.output.length > ATTACHMENT_OFFICE_OUTPUT_MAX_CHARS) {
        rejectAfterTermination("protocol_error");
        return;
      }
      terminateAndDeliver({ output: message.output });
    };
    const onError = () => rejectAfterTermination("worker_failed");
    const onExit = (code: number) => {
      if (settled || stopping) return;
      stopping = true;
      deliver({
        error: new AttachmentOfficeWorkerError(
          code === 0 ? "protocol_error" : "worker_failed",
        ),
      });
    };

    worker.on("message", onMessage);
    worker.on("error", onError);
    worker.on("exit", onExit);

    const timeoutMs = Math.max(1, Math.ceil(workerDeadlineAt - Date.now()));
    timer = setTimeout(() => rejectAfterTermination("timeout"), timeoutMs);
    timer.unref?.();
    options.signal?.addEventListener("abort", onAbort, { once: true });

    // Close the small race between the pre-spawn check and listener setup.
    if (options.signal?.aborted) onAbort();
  });
}
