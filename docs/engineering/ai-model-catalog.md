# AI model catalog policy

Verified: 2026-07-28 (Asia/Shanghai)

## Decision

`src/config/ai-models.ts` is the single, client-safe source of truth for models shown by NotePrompt. It contains no provider credentials or endpoints. `src/config/ai.ts` combines that catalog with server-only runtime settings and derives the legacy `AI_MODELS` view used by route adapters.

The selector is intentionally curated rather than an exhaustive mirror of every provider SKU. A model is selectable only when all of the following are true:

1. the provider currently documents its exact ID;
2. it accepts text through the OpenAI-compatible chat path used by NotePrompt;
3. it is active and is not a preview with restricted availability or a scheduled retirement;
4. its request policy can be represented by the current route adapter; and
5. it is relevant to prompt authoring, reasoning, coding, or long-context knowledge work.

Audio, TTS, ASR, image-generation, video-generation, and voice-cloning models never belong in this catalog. A multimodal model may be included only when it also supports text chat; the current NotePrompt selector still sends text.

## Availability has three independent layers

“The model exists in official documentation” is not proof that the production account can call it. NotePrompt records availability in three layers:

| Layer | Meaning | Pass condition |
| --- | --- | --- |
| L1 — official catalog | The exact ID is a current, documented API model. | The dated official model directory contains the exact ID and it is not marked preview, deprecated, or retired. |
| L2 — configuration ready | This deployment has a usable credential and the matching allowlisted endpoint. | The provider key exists server-side, its endpoint is allowed, and key type/account region matches that endpoint. |
| L3 — exact-model probe | This deployment can make a real request to that exact model now. | An authenticated, minimal text request using the exact ID succeeds and returns non-empty content. |

The table below reports L1, which is reproducible from public sources. L2 and L3 are deployment-specific and must not be guessed from source code, a provider logo, account balance, or a successful call to a different model. Operators must record those results using the [AI model availability runbook](../operations/ai-model-availability.md).

## Current curated set: 6 providers, 17 models

All 17 IDs passed L1 review on 2026-07-28. This review replaces the superseded `qwen3.6-flash` selector entry with `qwen3.7-flash`; the other 16 exact IDs remain current.

| Provider | Exact model ID | Official directory status | Generation role | NotePrompt default | Deploy availability |
| --- | --- | --- | --- | --- | --- |
| Qwen | `qwen3.7-plus` | Current, documented | Current 3.7 balanced model | Provider default | L2/L3 probe required |
| Qwen | `qwen3.7-max` | Current, documented | Current 3.7 flagship | — | L2/L3 probe required |
| Qwen | `qwen3.7-flash` | Current, documented | Current 3.7 fast model | — | L2/L3 probe required |
| DeepSeek | `deepseek-v4-flash` | Current, documented | Current V4 fast model | Provider default | L2/L3 probe required |
| DeepSeek | `deepseek-v4-pro` | Current, documented | Current V4 flagship | — | L2/L3 probe required |
| Kimi | `kimi-k3` | Current, documented | Current K3 flagship | Provider default | L2/L3 probe required |
| Kimi | `kimi-k2.7-code` | Current, documented | Previous-generation coding specialist | — | L2/L3 probe required |
| Kimi | `kimi-k2.7-code-highspeed` | Current, documented | Previous-generation high-speed coding variant | — | L2/L3 probe required |
| Kimi | `kimi-k2.6` | Current, documented | Previous-generation general model | — | L2/L3 probe required |
| Zhipu GLM | `glm-5.2` | Current, documented | Latest GLM flagship | Provider default | L2/L3 probe required |
| Zhipu GLM | `glm-5.1` | Current, documented | Previous 5.x balanced generation | — | L2/L3 probe required |
| Zhipu GLM | `glm-5-turbo` | Current, documented | Current 5.x fast/long-task variant | — | L2/L3 probe required |
| MiniMax | `MiniMax-M3` | Current, documented | Latest M-series flagship | Provider and product default | L2/L3 probe required |
| MiniMax | `MiniMax-M2.7-highspeed` | Current, documented | Previous-generation high-speed variant | — | L2/L3 probe required |
| MiniMax | `MiniMax-M2.7` | Current, documented | Previous-generation standard variant | — | L2/L3 probe required |
| Xiaomi MiMo | `mimo-v2.5-pro` | Current, documented | Current V2.5 flagship | Provider default | L2/L3 probe required |
| Xiaomi MiMo | `mimo-v2.5` | Current, documented | Current V2.5 balanced model | — | L2/L3 probe required |

The product-wide default is `minimax/MiniMax-M3`. Invalid deployment overrides are normalized back to a provider-local active default instead of allowing an unavailable ID to reach a request. NotePrompt has no cross-provider fallback: after a user selects a provider, a failed request must not send the prompt to another company.

`requestPolicy.maxOutputTokens` is NotePrompt's application-side safety ceiling, not a claim about every provider's theoretical maximum output. Route adapters may impose a lower limit. The context-window field records the documented provider limit for product guidance and future validation. For MiniMax models, the value `8192` is specifically NotePrompt's safety ceiling, not the upstream model's theoretical limit.

## MiniMax M3 quota semantics

MiniMax M3 is “unlimited” only in the narrow **NotePrompt product-quota** sense: NotePrompt does not debit its own per-user AI quota for this model. It is not a promise of unlimited upstream service. Provider authentication, balance or subscription windows, RPM/TPM, concurrency, abuse controls, and outages still apply.

As verified on 2026-07-28, MiniMax documents M3 limits of 20 RPM / 1,000,000 TPM for free users and 200 RPM / 10,000,000 TPM for recharged users. Token Plan also has fixed usage windows, and its subscription key is not interchangeable with the pay-as-you-go API key. These are provider facts, not a NotePrompt service guarantee; the provider can change them.

The Studio exposes a portable sampling envelope (`temperature` 0.1–1.0 and `top_p` 0.1–1.0) for configurable models. This intentionally avoids provider-edge values that are legal for one vendor but rejected by another. Models with provider-controlled sampling, such as Kimi K3/K2.x, disable those controls and omit both fields. The Studio output-token control is capped at 8192 and is lowered further when a model has a smaller application ceiling.

## Removed compatibility IDs

- `qwen3.8-max-preview` is intentionally excluded because it is a restricted Token Plan preview rather than a generally available production API model.
- `qwen3.6-flash` was replaced by the current stable `qwen3.7-flash`.
- `deepseek-chat` and `deepseek-reasoner` have a dated retirement and are replaced by DeepSeek V4 IDs.
- `kimi-k2.5` and `moonshot-v1-*` are closing to new accounts and have a published platform sunset; old K2 preview/thinking IDs are already retired.
- Xiaomi MiMo V2 IDs are deprecated in favor of V2.5. MiMo TTS, ASR, and voice models are not text-chat choices.
- Older Qwen, GLM, and MiniMax IDs are not exposed merely for request replay. Existing saved prompts do not persist a model foreign key, so removing selector options does not mutate prompt data.

## Regional and credential boundaries

- Qwen Model Studio regions have separate endpoints, keys, and model lists. The current runtime uses the China endpoint; a key from another region must not be paired with it.
- Kimi China (`platform.kimi.com`, `api.moonshot.cn`) and global (`platform.kimi.ai`, `api.moonshot.ai`) accounts and keys are completely independent. NotePrompt currently preserves the China endpoint.
- MiniMax pay-as-you-go API keys and Token Plan subscription keys are distinct and are not interchangeable.
- Xiaomi pay-as-you-go and Token Plan credentials/endpoints have different usage boundaries. NotePrompt intentionally uses the pay-as-you-go OpenAI-compatible endpoint for its custom backend.

Never “fix” a 401 or `model_not_found` error by trying a credential against several regional endpoints. Confirm the credential origin, select exactly one matching endpoint, and run the L2/L3 checks without logging the key.

## Official sources

- Qwen text models: https://help.aliyun.com/zh/model-studio/text-generation-model
- Qwen regions and key boundaries: https://help.aliyun.com/zh/model-studio/regions/
- DeepSeek model IDs and retirement notice: https://api-docs.deepseek.com/
- DeepSeek model details: https://api-docs.deepseek.com/quick_start/pricing/
- Kimi China model list: https://platform.kimi.com/docs/models
- Kimi global model list: https://platform.kimi.ai/docs/models
- Kimi regional key boundary: https://platform.kimi.com/docs/guide/faq
- Kimi K3 request limits: https://platform.kimi.ai/docs/guide/kimi-k3-quickstart
- Kimi model discovery: https://platform.kimi.ai/docs/api/list-models
- Zhipu GLM model overview: https://docs.bigmodel.cn/cn/guide/start/model-overview
- MiniMax OpenAI-compatible text API: https://platform.minimaxi.com/docs/api-reference/text-openai-api
- MiniMax rate limits: https://platform.minimaxi.com/docs/guides/rate-limits
- MiniMax Token Plan and key boundary: https://platform.minimaxi.com/docs/token-plan/intro
- Xiaomi MiMo current model list: https://mimo.mi.com/docs/en-US/quick-start/model
- Xiaomi MiMo OpenAI-compatible API: https://mimo.mi.com/docs/en-US/api/chat/openai-api
- Xiaomi Token Plan usage boundary: https://mimo.mi.com/docs/tokenplan/subscription

Re-verify these official pages before every model-catalog release and at least monthly. Keep this versioned catalog deterministic so builds and rollbacks remain reproducible.