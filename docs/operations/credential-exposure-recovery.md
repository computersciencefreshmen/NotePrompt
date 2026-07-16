# NotePrompt 凭据泄露与 Git 历史净化运行手册

状态：Stage 1C 生产事故运行手册
最后审阅：2026-07-16
适用范围：`computersciencefreshmen/NotePrompt` 及其构建、部署和备份副本

## 1. 目标、权限与硬停止条件

本仓库的旧提交曾包含真实生产凭据。删除当前文件、增加 ignore 或让扫描忽略旧命中都不能撤销泄露。本手册的完成条件是：旧凭据全部失效、所有可控 Git 历史和派生制品完成净化、所有协作者重新克隆，并且 `Release Quality / Release gate` 在新历史上全绿且成为必需检查。

本手册不是执行授权。只有仓库所有者和生产负责人可以开启维护窗口、调整 ruleset 或执行 force push。满足以下任一条件时立即停止：

- 任一受影响凭据尚未撤销或无法证明旧值已经失效；
- 生产仍在使用旧凭据，或数据库/登录/邮件/AI/readiness 未通过新凭据验证；
- Git push、PR merge、tag、release 或生产发布没有全部冻结；
- 远端 ref 在冻结后仍发生变化；
- 全 refs Gitleaks 仍有命中，或 ref/commit/LFS 核对结果无法解释；
- 唯一受控重写副本、精确远端 URL 或仓库所有者批准缺失。

2026-07-16 的只读预检已经证明当前开发工作副本不适合作为重写源：本地包含远端没有的分支/工具 ref，remote-tracking ref 已出现过滞后，而且未安装 `git-filter-repo` 与 Gitleaks。任何正式处置都必须重新采样远端状态，并从隔离目录创建全新副本。

## 2. 无秘密事件台账

事件台账只记录以下元数据，不得复制密码、私钥、token、替换前文本或完整环境文件：

| 字段 | 要求 |
|---|---|
| 事件负责人 / 审批人 | 仓库 owner、生产 owner、安全复核人 |
| 受影响系统 | SSH、MySQL、站点管理员、SMTP、AI/provider、运行时秘密、GitHub、TLS 等 |
| 凭据标识 | 账号名、key ID、末四位或不可逆指纹 |
| 发现证据 | 文件路径、commit ID、扫描规则；不记录匹配值 |
| 生命周期证据 | 撤销时间、新值切换时间、旧值失效验证、验证人 |
| Git 证据 | T0/Tpush ref 清单哈希、changed refs、First Changed Commit(s) |
| 派生制品 | workflow run、artifact、cache、镜像 digest、发布包的精确 ID |
| 关闭证据 | GitHub Support 工单、全绿 CI、重克隆确认、保护规则截图/导出 |

所有含旧历史、替换清单或扫描报告的证据必须位于受限加密存储，权限最小化并设置销毁日期。它们不得进入仓库、shell history、聊天或普通工单附件。

## 3. Gate A：先轮换并证明旧凭据失效

历史重写不能替代轮换。逐项填写负责人和证据，全部完成后才能进入 Gate B。

| 类别 | 必须执行 | 退出证据 |
|---|---|---|
| SSH / 运维 | 撤销旧 key、密码和临时账号；优先切换到具名最小权限 sudo 账号 | 新账号登录成功；旧 key/密码被拒绝；授权 key 清单复核 |
| MySQL | 分别轮换 app、migration、backup/operator 账号；先建新最小权限账号再切换，最后删除旧账号 | 应用、迁移、备份成功；旧账号认证失败；3306 未对公网开放 |
| 站点管理员 | 重置管理员密码和恢复渠道，增加 `session_version` 或等效地撤销全部旧会话 | 旧密码与旧 token 均失败；新登录和权限边界通过 |
| SMTP | 撤销旧应用密码/token，再签发新凭据 | 新凭据完成真实投递；旧 SMTP 认证失败 |
| AI / provider | 撤销所有可能暴露的全局 key、第三方 token 和部署凭据 | 各 provider 新 key 成功；旧 key 在供应商侧显示 revoked/invalid |
| 运行时秘密 | 独立轮换 JWT、验证码 HMAC 和 provider 配置加密秘密 | 用户会话按计划失效；旧验证码失效；受影响 provider key 已撤销并重新录入 |
| GitHub / 发布 | 检查 PAT、deploy key、webhook secret、registry/package 凭据 | 旧 credential ID 已删除；新发布身份权限最小化 |
| TLS | 仅在私钥可能进入旧镜像、缓存或历史时重新签发并撤销旧证书 | 新证书链/域名/私钥匹配；旧证书已撤销或不再受信 |

`PROVIDER_KEY_ENCRYPTION_SECRET` 没有双密钥在线轮换能力。若它或数据库副本可能泄露，应先撤销底层 provider key，再清除或重新录入受影响配置，最后切换加密秘密；禁止只换加密秘密而把现有密文永久锁死。

## 4. Gate B：冻结全部写入并建立 T0 证据

冻结范围包括 branch/tag push、PR merge、release、package、自动发布和生产写入窗口；不是只冻结应用发布。确认所有协作者、fork owner、部署负责人和 GitHub owner 在线，取消或等待正在运行的写任务结束。

在受限 Linux 事故主机上设置严格权限，并以实时远端为准：

```bash
set -euo pipefail
umask 077
export INCIDENT_ROOT=/secure/noteprompt-incident-YYYYMMDD
export EXACT_REPO_URL=https://github.com/computersciencefreshmen/NotePrompt.git
mkdir -p "$INCIDENT_ROOT/evidence"

git ls-remote --symref "$EXACT_REPO_URL" \
  > "$INCIDENT_ROOT/evidence/remote-refs-t0.txt"
test -s "$INCIDENT_ROOT/evidence/remote-refs-t0.txt"
sha256sum "$INCIDENT_ROOT/evidence/remote-refs-t0.txt" \
  > "$INCIDENT_ROOT/evidence/remote-refs-t0.sha256"
```

另行导出 ruleset/branch protection、开放 PR、fork、release/package、Actions run/artifact/cache 清单。记录数量与精确 ID。当前历史中的保守路径启发式已发现约 50 个遗留运维脚本路径，并且 release、rollback、分支和 tag 均可能可达；最终范围必须由全历史秘密扫描和人工复核决定，不能只清 `main` 或三个代表文件。

## 5. Gate C：隔离副本与一次性历史重写

固定并验证 `git-filter-repo >= 2.47`；当前工作机没有该工具，禁止退回 `filter-branch`。创建两份全新副本：一份加密、只读、禁止 push 的取证镜像；一份可丢弃的清理镜像。

```bash
set -euo pipefail
cd "$INCIDENT_ROOT"
git clone --mirror "$EXACT_REPO_URL" evidence-only.git
git -C evidence-only.git remote set-url --push origin disabled://incident-evidence

git clone --mirror "$EXACT_REPO_URL" rewrite.git
git -C rewrite.git fetch origin '+refs/pull/*:refs/pull/*'
```

在 T0 台账中记录 heads、tags、`refs/pull/*` 和 LFS 状态。清理副本不得包含本地 Codex/tool ref、备份 ref 或其他不属于实时 GitHub 的引用。

人工审核两份仓库外文件：

- `purge-paths.txt`：每行使用 `literal:<historic/path>`，包含改名/移动前的全部路径；
- `replacements.txt`：只放仍需保留文件中的秘密替换规则，位于加密卷且权限为 `0600`。

先在可丢弃副本演练并审核结果；正式运行时把路径删除和文本替换放在同一次重写中。不得把秘密字面量放到命令行，不得使用 `--no-fetch`，也不得用 `--force` 绕过 fresh-clone 安全检查。

```bash
set -euo pipefail
cd "$INCIDENT_ROOT/rewrite.git"
git filter-repo \
  --sensitive-data-removal \
  --invert-paths \
  --paths-from-file "$INCIDENT_ROOT/purge-paths.txt" \
  --replace-text "$INCIDENT_ROOT/replacements.txt"

FILTER_REPO_DIR="$(git rev-parse --git-dir)/filter-repo"
test -s "$FILTER_REPO_DIR/changed-refs"
```

保存 `$GIT_DIR/filter-repo/changed-refs`、commit/ref map、First Changed Commit(s)、受影响 PR 数量和 orphaned LFS 报告。mirror clone 是 bare repository，`git rev-parse --git-dir` 通常返回 `.`，不能把路径写死为 `.git/filter-repo/...`。若没有需要替换的保留文件，省略 `--replace-text`；不得创建空的伪替换文件掩盖范围不清。

## 6. Gate D：推送前验收

在清理镜像中完成以下全部检查：

```bash
set -euo pipefail
git fsck --full
git for-each-ref \
  --format='%(refname) %(objectname)' \
  refs/heads refs/tags refs/pull \
  | sort > "$INCIDENT_ROOT/evidence/rewritten-refs.txt"
test -s "$INCIDENT_ROOT/evidence/rewritten-refs.txt"

docker run --rm \
  --volume "$INCIDENT_ROOT/rewrite.git:/repo" \
  --workdir /repo \
  --env GIT_CONFIG_COUNT=1 \
  --env GIT_CONFIG_KEY_0=safe.directory \
  --env GIT_CONFIG_VALUE_0=/repo \
  ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f \
  git . --log-opts='--all' --redact --no-banner --no-color
```

然后从清理镜像创建普通验证 clone，使用 Node 24 执行 lint、完整测试、真实 MySQL migration replay、production build、Compose config、Docker build 与 Trivy。逐个验证批准删除的历史路径在所有可达 refs 中均不存在。

CI 的 `fetch-depth: 0` 只能验证 runner 实际取得的引用，不能证明 GitHub 的隐藏/PR refs 已清理；Stage 1C 必须以 fresh mirror 的 `--all`、`changed-refs`、PR/LFS 证据和 GitHub Support 结果为准。

push 前再次读取远端并与 T0 逐字比较。任何变化都说明冻结失效，必须中止并从新的 T0 重新开始：

```bash
set -euo pipefail
git ls-remote --symref "$EXACT_REPO_URL" \
  > "$INCIDENT_ROOT/evidence/remote-refs-tpush.txt"
test -s "$INCIDENT_ROOT/evidence/remote-refs-tpush.txt"
cmp \
  "$INCIDENT_ROOT/evidence/remote-refs-t0.txt" \
  "$INCIDENT_ROOT/evidence/remote-refs-tpush.txt"
```

## 7. Gate E：唯一受控 force push 与 GitHub 残留

force push 是不可逆外部动作，执行当下仍需仓库所有者再次确认：Gate A-D 已签字、冻结仍有效、远端 URL 精确、changed refs 合理、灾备证据可读、GitHub Support 与重克隆窗口已安排。

`git-filter-repo` 可能移除 `origin`。只在人工核对精确 URL 后恢复；临时调整最小范围的 ruleset，然后由唯一受控副本执行：

```bash
set -euo pipefail
git remote -v
if git remote get-url origin >/dev/null 2>&1; then
  test "$(git remote get-url origin)" = "$EXACT_REPO_URL"
else
  git remote add origin "$EXACT_REPO_URL"
fi

# 只允许 fresh mirror 中出现 GitHub heads、tags 和只读 pull refs。
test -z "$(git for-each-ref --format='%(refname)' \
  | grep -Ev '^refs/(heads|tags|pull)/' || true)"
git push --force --mirror origin
```

GitHub 的 `refs/pull/*` 是只读引用，推送拒绝这些 refs 属于预期；任何 branch、tag 或其他可写 ref 失败都必须停止，修正保护策略后重新执行完整核对，禁止零散补推。只有下述远端精确比对成功后才能恢复 ruleset/branch protection。

无论 mirror push 是否报告只读 pull ref 拒绝，都必须由第二人复核输出，并从远端重新读取 heads/tags，与清理镜像中的预期 SHA 和名称逐字比较。任一差异都保持冻结，不得恢复保护或继续清理：

```bash
set -euo pipefail
git for-each-ref \
  --format='%(objectname) %(refname)' \
  refs/heads refs/tags \
  | sort -k2 > "$INCIDENT_ROOT/evidence/expected-heads-tags.txt"
git ls-remote --refs --heads --tags "$EXACT_REPO_URL" \
  | sort -k2 > "$INCIDENT_ROOT/evidence/remote-heads-tags-after.txt"
test -s "$INCIDENT_ROOT/evidence/expected-heads-tags.txt"
test -s "$INCIDENT_ROOT/evidence/remote-heads-tags-after.txt"
cmp \
  "$INCIDENT_ROOT/evidence/expected-heads-tags.txt" \
  "$INCIDENT_ROOT/evidence/remote-heads-tags-after.txt"
```

force push 不会清除 PR refs、fork、cached commit views、服务端对象或 orphaned LFS。依据 [GitHub 敏感数据清理指南](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) 提交 Support 工单，提供仓库、受影响 PR 数、First Changed Commit(s) 和 LFS orphan 信息；协调所有 fork owner 重写或删除 fork。Support 和 fork 未闭环前，事故不得标记为关闭。

## 8. Gate F：派生制品、重克隆与恢复保护

先只读列出 Actions 对象并人工核对精确 ID：

```bash
gh api --paginate '/repos/computersciencefreshmen/NotePrompt/actions/runs?per_page=100'
gh api --paginate '/repos/computersciencefreshmen/NotePrompt/actions/artifacts?per_page=100'
gh api --paginate '/repos/computersciencefreshmen/NotePrompt/actions/caches?per_page=100'
```

只对台账中已核对的单个 ID 删除；禁止编写无边界批量循环：

```bash
gh api --method DELETE \
  '/repos/computersciencefreshmen/NotePrompt/actions/runs/<VERIFIED_RUN_ID>'
gh api --method DELETE \
  '/repos/computersciencefreshmen/NotePrompt/actions/artifacts/<VERIFIED_ARTIFACT_ID>'
gh api --method DELETE \
  '/repos/computersciencefreshmen/NotePrompt/actions/caches/<VERIFIED_CACHE_ID>'
```

同样按精确 ID/digest 清理旧 workflow logs、release assets、GitHub Packages/registry layer、服务器镜像、BuildKit cache、离线部署包、对象存储和备份副本。先用已清理 commit 无缓存构建并部署不可变 SHA 镜像，再删除污染对象；严禁 `docker system prune --volumes`。

最后执行：

1. 从 GitHub 全新 clone，并重新获取所有 heads/tags 后运行全历史 Gitleaks；结果必须为零。
2. 手工触发 `Release Quality`；所有 job 包括 `Release gate` 必须成功。
3. 将 `Release Quality / Release gate` 配置为默认分支 required check，并实际验证一次未通过时无法合并。
4. 所有协作者删除旧 clone 后重新 clone；禁止从旧 clone merge、rebase 或 push。未合并工作只能在新 clone 中按 commit 逐项复核、cherry-pick，并重新扫描。
5. 对比最终远端 ref 清单，恢复 push/merge/release/deploy，并记录恢复时间和批准人。
6. 只有旧凭据失效、Git/PR/fork/cache/制品清理、Support、重克隆和全绿 required gate 全部完成后，Stage 1C 才能关闭。

force push 之后不得把取证镜像推回远端。若发现遗漏，保持写入冻结，从取证证据创建新的可丢弃清理副本并重新净化；恢复旧 refs 会重新公开已经删除的秘密。

## 参考

- [GitHub：从仓库移除敏感数据](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [GitHub Actions workflow runs REST API](https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2022-11-28)
- [GitHub Actions artifacts REST API](https://docs.github.com/en/rest/actions/artifacts?apiVersion=2022-11-28)
- [GitHub Actions cache REST API](https://docs.github.com/en/rest/actions/cache?apiVersion=2022-11-28)
- [git-filter-repo 官方文档](https://github.com/newren/git-filter-repo/blob/main/Documentation/git-filter-repo.txt)
- [Gitleaks](https://github.com/gitleaks/gitleaks)
