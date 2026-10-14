import type { ContentQuery } from "cms-content/blocs/core/markup/validation/nativeContent";
import type {
    BindingAnalysisOptions,
    BindingQueryCapabilityResolver,
    BindingQueryTarget,
} from "cms-content/blocs/core/markup/validation/bindingAnalysis";

export interface ContentBindingValidationOptions {
    readonly resolveQueryCapabilities?: BindingQueryCapabilityResolver;
    readonly requireQueryCapabilityResolution?: boolean;
}

export async function resolveBindingAnalysisOptions(
    queries: readonly ContentQuery[],
    options: ContentBindingValidationOptions,
): Promise<BindingAnalysisOptions> {
    const targets = uniqueProviderTargets(queries);
    const capabilities = options.resolveQueryCapabilities ? await options.resolveQueryCapabilities(targets) : undefined;
    return {
        ...(capabilities ? { capabilities } : {}),
        ...(options.requireQueryCapabilityResolution ? { requireCapabilityResolution: true } : {}),
    };
}

function uniqueProviderTargets(queries: readonly ContentQuery[]): readonly BindingQueryTarget[] {
    const targets = new Map<string, BindingQueryTarget>();
    for (const { contractId, capabilityId } of queries) {
        if (contractId.startsWith("kernel.")) {
            continue;
        }
        targets.set(`${contractId}\0${capabilityId}`, { contractId, capabilityId });
    }
    return [...targets.values()];
}
