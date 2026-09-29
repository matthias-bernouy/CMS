import {
    detectPageIndexingCandidates,
    PAGE_METADATA_PLATFORM_VARIABLES,
    type PageIndexingDetectionStatus,
    type TPage,
} from "@bernouy/cms-content";
import type { GatewayEditorCapability } from "@bernouy/cms-gateway";

export type PageIndexingEditorCandidate = {
    value: string;
    label: string;
    variables: string[];
    suggestedTitle: string;
    suggestedDescription: string;
};

export type PageIndexingEditorModel = {
    configured: boolean;
    suggested: boolean;
    detectionStatus: PageIndexingDetectionStatus;
    enabled: boolean;
    selection: string;
    selectionValid: boolean;
    availableVariables: string[];
    candidates: PageIndexingEditorCandidate[];
    definition?: NonNullable<TPage["indexing"]>["entity"];
    discoverOptions?: Array<{ value: string; label: string }>;
};

export async function buildPageIndexingEditor(
    page: TPage,
    capabilities: readonly GatewayEditorCapability[],
): Promise<PageIndexingEditorModel> {
    const detection = detectPageIndexingCandidates(page.content);
    const candidates = detection.candidates.flatMap((candidate) => {
        const capability = capabilities.find(
            (item) => item.contractId === candidate.contractId && item.capabilityId === candidate.capabilityId,
        );
        if (
            !capability ||
            capability.effect !== "query" ||
            capability.output.type !== "object" ||
            !capability.output.properties[candidate.inputParam]
        ) {
            return [];
        }
        const variables = Object.entries(capability.output.properties)
            .filter(([, schema]) => schema.type === "string" || schema.type === "number" || schema.type === "integer")
            .slice(0, 32)
            .map(([name]) => `content.${name}`);
        return [
            {
                value: pageIndexingCandidateValue(candidate),
                label: capability.description ?? capability.capabilityId,
                variables,
                suggestedTitle: variables.includes("content.title") ? "${content.title}" : "",
                suggestedDescription: variables.includes("content.description") ? "${content.description}" : "",
            },
        ];
    });
    const configuredSelection = page.indexing?.entity
        ? pageIndexingCandidateValue({
              contractId: page.indexing.entity.contractId,
              capabilityId: page.indexing.entity.resolve.capabilityId,
              inputParam: page.indexing.entity.resolve.inputParam,
              pageQueryParam: page.indexing.entity.pageQueryParam,
          })
        : "";
    const configuredCandidate = candidates.find(({ value }) => value === configuredSelection);
    const suggestion = !configuredCandidate && candidates.length === 1 ? candidates[0] : undefined;
    const selected = configuredCandidate ?? suggestion;
    return {
        configured: page.indexing !== undefined,
        suggested: suggestion !== undefined,
        detectionStatus: candidates.length === 0 ? "none" : candidates.length === 1 ? "detected" : "ambiguous",
        enabled: page.indexing?.enabled ?? candidates.length <= 1,
        selection: selected?.value ?? "",
        selectionValid: page.indexing?.entity === undefined || configuredCandidate !== undefined,
        availableVariables: [...PAGE_METADATA_PLATFORM_VARIABLES],
        candidates,
        ...(page.indexing?.entity ? { definition: page.indexing.entity } : {}),
        discoverOptions: capabilities
            .filter(
                (capability) =>
                    capability.access === "public" &&
                    capability.effect === "query" &&
                    capability.output.type === "object",
            )
            .map((capability) => ({
                value: `${capability.contractId}|${capability.capabilityId}`,
                label: `${capability.contractLabel} · ${capability.description ?? capability.capabilityId}`,
            })),
    };
}

export function pageIndexingCandidateValue(candidate: {
    contractId: string;
    capabilityId: string;
    inputParam: string;
    pageQueryParam: string;
}): string {
    return [candidate.contractId, candidate.capabilityId, candidate.inputParam, candidate.pageQueryParam]
        .map(encodeURIComponent)
        .join("|");
}
