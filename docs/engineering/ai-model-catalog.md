# AI model catalog policy

Verified: 2026-07-20 (Asia/Shanghai)

## Decision

`src/config/ai-models.ts` is the single, client-safe source of truth for models shown by NotePrompt. It contains no provider credentials or endpoints. `src/config/ai.ts` combines that catalog with server-only runtime settings and derives the legacy `AI_MODELS` view used by route adapters.

The selector is intentionally curated rather than an exhaustive mirror of every provider SKU. A model is selectable only when all of the following are true:

1. the provider currently documents its exact ID;
2. it accepts text through the OpenAI-compatible chat path used by NotePrompt;
3. it is active and is not a preview with restricted availability or a scheduled retirement;
4. its request policy can be represented by the current route adapter; and
5. it is relevant to prompt authoring, reasoning, coding, or long-context knowledge work.

Audio, TTS, ASR, image-generation, video-generation, and voice-cloning models never belong in this catalog. A multimodal model may be included only when it also supports text chat; the current NotePrompt selector still sends text.

## Current curated set

| Provider | Default | Other selectable models |
| --- | --- | --- |
| Qwen | `qwen3.7-plus` | `qwen3.7-max`, `qwen3.6-flash` |
| DeepSeek | `deepseek-v4-flash` | `deepseek-v4-pro` |
| Kimi | `kimi-k3` | `kimi-k2.7-code`, `kimi-k2.7-code-highspeed`, `kimi-k2.6` |
| Zhipu GLM | `glm-5.2` | `glm-5.1`, `glm-5-turbo` |
| MiniMax | `MiniMax-M3` | `MiniMax-M2.7-highspeed`, `MiniMax-M2.7` |
| Xiaomi MiMo | `mimo-v2.5-pro` | `mimo-v2.5` |

The product-wide default is `minimax/MiniMax-M3`. Invalid deployment overrides are normalized back to a provider-local active default instead of allowing an unavailable ID to reach a request. NotePrompt has no cross-provider fallback: after a user selects a provider, a failed request must not send the prompt to another company.

`requestPolicy.maxOutputTokens` is NotePrompt's application-side safety ceiling, not a claim about every provider's theoretical maximum output. Route adapters may impose a lower limit. The context-window field records the documented provider limit for product guidance and future validation.

The Studio exposes a portable sampling envelope (`temperature` 0.1–1.0 and `top_p` 0.1–1.0) for configurable models. This intentionally avoids provider-edge values that are legal for one vendor but rejected by another. Models with provider-controlled sampling, such as Kimi K3/K2.x, disable those controls and omit both fields. The Studio output-token control is capped at 8192 and is lowered further when a model has a smaller application ceiling.

## Removed compatibility IDs

- `qwen3.8-max-preview` is intentionally excluded because it is a restricted Token Plan preview rather than a generally available production API model.
- `deepseek-chat` and `deepseek-reasoner` have a dated retirement and are replaced by DeepSeek V4 IDs.
- `kimi-k2.5` and `moonshot-v1-*` are closing to new accounts and have a published platform sunset; old K2 preview/thinking IDs are already retired.
- Xiaomi MiMo V2 IDs are no longer current. MiMo TTS and voice models are not text-chat models.
- Older Qwen, GLM, and MiniMax IDs are not exposed merely for request replay. Existing saved prompts do not persist a model foreign key, so removing selector options does not mutate prompt data.

## Official sources

- Qwen text models: https://help.aliyun.com/zh/model-studio/text-generation-model
- DeepSeek model IDs and retirement notice: https://api-docs.deepseek.com/
- Kimi current model list: https://platform.kimi.com/docs/models and https://platform.kimi.ai/docs/models
- Kimi K3 request limits: https://platform.kimi.ai/docs/guide/kimi-k3-quickstart
- Kimi model discovery and endpoint behavior: https://platform.kimi.ai/docs/api/list-models
- Zhipu GLM model overview: https://docs.bigmodel.cn/cn/guide/start/model-overview
- MiniMax OpenAI-compatible text API: https://platform.minimaxi.com/docs/api-reference/text-openai-api
- Xiaomi MiMo current model list: https://mimo.mi.com/docs/en-US/quick-start/model
- Xiaomi MiMo OpenAI-compatible API: https://mimo.mi.com/docs/en-US/api/chat/openai-api
- Xiaomi MiMo sampling policy: https://mimo.mi.com/docs/en-US/api/guidance/model-hyperparameters
- Xiaomi Token Plan usage boundary: https://mimo.mi.com/docs/tokenplan/subscription

## Operational compatibility

Kimi has separate platform regions. Keys issued by `platform.kimi.ai` and `platform.kimi.com` are **not interchangeable**, and their API hosts differ. NotePrompt currently preserves the China endpoint `https://api.moonshot.cn/v1`; moving an account to the global endpoint requires a deliberate base-URL allowlist change plus a live `/v1/models` probe with the matching key.

MiniMax pay-as-you-go API keys and Token Plan subscription keys are also distinct credentials. Before production cutover, use the configured key to run the authenticated provider diagnostic for `MiniMax-M3`; do not infer entitlement from the model appearing in public documentation.

Xiaomi uses the pay-as-you-go endpoint `https://api.xiaomimimo.com/v1`. MiMo Token Plan credentials and `token-plan-*` endpoints are intentionally rejected because the provider limits those packages to approved programming tools and prohibits custom application backends.

Re-verify the official pages before every model-catalog release and at least monthly. If a provider offers an authenticated `/v1/models` endpoint, compare it during deployment diagnostics, but keep this versioned catalog deterministic so builds and rollbacks remain reproducible.
