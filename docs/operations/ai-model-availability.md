# AI model availability runbook

Verified procedure: 2026-07-28 (Asia/Shanghai)

## Purpose

This runbook distinguishes a model being listed by its provider from the production deployment being able to call it. Run it after a catalog change, credential rotation, endpoint change, provider incident, or unexplained 401/403/404/429 response. Never expose credentials in tickets, Markdown, shell history, screenshots, application logs, or probe output.

## Availability states

| State | Meaning |
| --- | --- |
| `catalog-verified` | Exact ID passed the dated L1 official-directory review. |
| `configured` | Server credential exists and matches the allowlisted endpoint/key type. |
| `probed` | An authenticated request to the exact model succeeded in this environment. |
| `degraded` | Exact model previously passed but now fails transiently or is rate-limited. |
| `unavailable` | Credential lacks entitlement, model is retired, or the endpoint/key pairing is invalid. |
| `unknown` | L2 or L3 has not run; this must never be displayed as “available.” |

## Configuration readiness (L2)

For each provider, confirm the expected server environment variable exists without printing its value, resolve the effective URL through the production configuration path, verify it is allowlisted, and confirm key type/account region matches it.

| Provider | NotePrompt endpoint family | Boundary |
| --- | --- | --- |
| Qwen | `dashscope.aliyuncs.com/compatible-mode/v1` | Model Studio keys, endpoints, and model lists are region-specific and cannot be mixed. |
| DeepSeek | `api.deepseek.com/v1` | Use a DeepSeek platform API key. |
| Kimi | `api.moonshot.cn/v1` | China and global accounts/keys are independent; global keys require `api.moonshot.ai/v1`. |
| Zhipu GLM | `open.bigmodel.cn/api/paas/v4` | Use a BigModel key authorized for the exact model. |
| MiniMax | `api.minimaxi.com/v1` | Pay-as-you-go and Token Plan keys are separate credential classes. |
| Xiaomi MiMo | `api.xiaomimimo.com/v1` | NotePrompt uses pay-as-you-go; do not substitute a Token Plan endpoint/key. |

Stop on an endpoint/key mismatch. Do not spray the same key across alternative hosts.

## Exact-model probe (L3)

Provider `/models` discovery, when available, is useful but insufficient: it may list a model that the current account cannot invoke. The decisive check is a minimal authenticated request using the exact ID.

For every one of the 17 catalog entries:

1. Optionally query the authenticated model list and record whether the exact ID appears.
2. Send a non-streaming chat request to that exact ID with a harmless prompt such as “Reply with OK”.
3. Use the smallest practical output limit, a bounded timeout, and no user data.
4. Pass only on a 2xx response with a non-empty assistant message.
5. Record provider, exact ID, environment, region, UTC time, latency, HTTP status, provider request ID, and sanitized error class.
6. Never record response bodies, authorization headers, prompts containing user data, or credentials.

Run probes serially or with very low concurrency. They consume quota and can trigger RPM/TPM limits. MiniMax M3, for example, documents 20 RPM for free users and 200 RPM for recharged users.

## Failure interpretation

| Result | Likely meaning | Action |
| --- | --- | --- |
| 401 | Missing/wrong key, key-type mismatch, or regional endpoint mismatch | Re-check credential origin and endpoint; rotate if exposure is suspected. |
| 403 | Account/model entitlement or policy denial | Check console authorization; do not mark the entire provider down. |
| 404 / `model_not_found` | Wrong exact ID, endpoint, retirement, or missing entitlement | Recheck the official directory and regional account. |
| 429 | Provider RPM/TPM/concurrency/subscription-window limit | Respect retry headers, back off with jitter, and retain NotePrompt rate limits. |
| 5xx / timeout | Provider or network degradation | Retry a bounded number of times; mark `degraded`, not permanently unavailable. |
| 2xx with empty content | Adapter or response-contract problem | Fail the probe and inspect only a sanitized response shape. |

One model passing does not prove sibling models are available. Record L3 per exact ID.

## Release gate

Report a model as `available` only when L2 and a recent L3 probe pass; use `configured, not verified` when L3 is absent/stale, `temporarily degraded` for transient failures, and `unavailable` for confirmed entitlement, endpoint, or retirement failures.

Before release, probe the product default `minimax/MiniMax-M3`, then each provider-local default, then the remaining models. Preserve provider boundaries: a MiniMax failure must not silently send user content to another provider.