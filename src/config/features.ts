export const featureFlags = {
  promptOptimizerV2: process.env.NODE_ENV !== 'production'
    ? process.env.NEXT_PUBLIC_ENABLE_PROMPT_OPTIMIZER_V2 !== 'false'
    : process.env.NEXT_PUBLIC_ENABLE_PROMPT_OPTIMIZER_V2 === 'true',
}
