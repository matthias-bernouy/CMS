/** Exact browser ABI understood by the current shared CMS runtime. */
export const CMS_BROWSER_RUNTIME_ABI = "v1" as const;

export type CmsBrowserRuntimeAbi = typeof CMS_BROWSER_RUNTIME_ABI;
