import type { ContentMutation, ContentQuery } from "cms-content/blocs/core/markup/validation/nativeContent";
import type {
    BindingAnalysisOptions,
    BindingCapabilityResolver,
    BindingCapabilityTarget,
    BindingQueryCapabilityResolver,
} from "cms-content/blocs/core/markup/validation/bindingAnalysis";
import type { SvgCapabilityTarget } from "cms-content/blocs/core/markup/security/svgReference";

export type SvgCapabilityValidator = (targets: readonly SvgCapabilityTarget[]) => Promise<void>;

export interface ContentBindingValidationOptions {
    readonly resolveCapabilities?: BindingCapabilityResolver;
    readonly resolveQueryCapabilities?: BindingQueryCapabilityResolver;
    readonly requireQueryCapabilityResolution?: boolean;
    readonly validateSvgCapabilities?: SvgCapabilityValidator;
    readonly requireSvgCapabilityResolution?: boolean;
}

export async function resolveBindingAnalysisOptions(
    queries: readonly ContentQuery[],
    mutations: readonly ContentMutation[],
    options: ContentBindingValidationOptions,
): Promise<BindingAnalysisOptions> {
    const targets = uniqueProviderTargets(queries, mutations);
    const capabilities = options.resolveCapabilities
        ? await options.resolveCapabilities(targets)
        : options.resolveQueryCapabilities
          ? await options.resolveQueryCapabilities(targets.filter(({ effect }) => effect === "query"))
          : undefined;
    return {
        ...(capabilities ? { capabilities } : {}),
        ...(options.requireQueryCapabilityResolution ? { requireCapabilityResolution: true } : {}),
    };
}

function uniqueProviderTargets(
    queries: readonly ContentQuery[],
    mutations: readonly ContentMutation[],
): readonly BindingCapabilityTarget[] {
    const targets = new Map<string, BindingCapabilityTarget>();
    for (const { contractId, capabilityId } of queries) {
        if (contractId.startsWith("edge.")) {
            continue;
        }
        targets.set(`${contractId}\0${capabilityId}`, { contractId, capabilityId, effect: "query" });
    }
    for (const { contractId, capabilityId } of mutations) {
        if (!contractId.startsWith("edge.")) {
            targets.set(`${contractId}\0${capabilityId}`, { contractId, capabilityId, effect: "command" });
        }
    }
    return [...targets.values()];
}
