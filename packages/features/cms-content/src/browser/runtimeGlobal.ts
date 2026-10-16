import { CMS_BROWSER_RUNTIME_ABI, type CmsBrowserRuntimeAbi } from "cms-content/browser/runtimeAbi";

export interface CmsBrowserRuntime extends Record<string, unknown> {
    readonly abi: CmsBrowserRuntimeAbi;
}

type CmsRuntimeWindow = Window & { cmsRuntime?: Record<string, unknown> };

/** Create or verify the one shared browser-runtime namespace. */
export function getCmsBrowserRuntime(target: Window): CmsBrowserRuntime {
    const runtimeWindow = target as CmsRuntimeWindow;
    if (!runtimeWindow.cmsRuntime) {
        const runtime: CmsBrowserRuntime = { abi: CMS_BROWSER_RUNTIME_ABI };
        runtimeWindow.cmsRuntime = runtime;
        return runtime;
    }
    if (runtimeWindow.cmsRuntime.abi !== CMS_BROWSER_RUNTIME_ABI) {
        throw new Error(
            `Incompatible CMS browser runtime ABI: expected ${CMS_BROWSER_RUNTIME_ABI}, received ${String(runtimeWindow.cmsRuntime.abi)}.`,
        );
    }
    return runtimeWindow.cmsRuntime as CmsBrowserRuntime;
}
