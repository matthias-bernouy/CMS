import {
    detectPageIndexingCandidates,
    PAGE_METADATA_PLATFORM_VARIABLES,
    type PageIndexingDetectionStatus,
    type TPage,
} from "@bernouy/cms-content";
import { SOURCE_INDEXING_VARIABLE_NAMESPACE, type Source, type SourceRepository } from "@bernouy/cms-sources";

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
};

export async function buildPageIndexingEditor(
    page: TPage,
    repository: SourceRepository | null | undefined,
): Promise<PageIndexingEditorModel> {
    const sources = repository ? await repository.getAllSources() : [];
    const detection = detectPageIndexingCandidates(page.content, sources);
    const candidates = detection.candidates.map((candidate) => editorCandidate(candidate, sources));
    const configuredSelection = page.indexing?.entity ? pageIndexingCandidateValue(page.indexing.entity) : "";
    const configuredCandidate = candidates.find(({ value }) => value === configuredSelection);
    const suggestion = !configuredCandidate && candidates.length === 1 ? candidates[0] : undefined;
    const selected = configuredCandidate ?? suggestion;

    return {
        configured: page.indexing !== undefined,
        suggested: suggestion !== undefined,
        detectionStatus: detection.status,
        enabled: page.indexing?.enabled ?? detection.status !== "ambiguous",
        selection: selected?.value ?? "",
        selectionValid:
            page.indexing?.entity === undefined || configuredCandidate !== undefined || suggestion !== undefined,
        availableVariables: [...PAGE_METADATA_PLATFORM_VARIABLES],
        candidates,
    };
}

export function pageIndexingCandidateValue(candidate: {
    sourceUrn: string;
    entityId: string;
    pageQueryParam: string;
}): string {
    return [candidate.sourceUrn, candidate.entityId, candidate.pageQueryParam].map(encodeURIComponent).join("|");
}

function editorCandidate(
    candidate: ReturnType<typeof detectPageIndexingCandidates>["candidates"][number],
    sources: readonly Source[],
): PageIndexingEditorCandidate {
    const source = sources.find(({ urn }) => urn === candidate.sourceUrn);
    const entity = source?.indexing?.entities.find(({ id }) => id === candidate.entityId);
    return {
        value: pageIndexingCandidateValue({
            sourceUrn: candidate.sourceUrn,
            entityId: candidate.entityId,
            pageQueryParam: candidate.identity.pageQueryParam,
        }),
        label: entity?.label?.trim() || "Dynamic content",
        variables: Object.keys(entity?.variables ?? {})
            .sort()
            .map((name) => `${SOURCE_INDEXING_VARIABLE_NAMESPACE}.${name}`),
        suggestedTitle: entity?.defaults?.titleTemplate ?? "",
        suggestedDescription: entity?.defaults?.descriptionTemplate ?? "",
    };
}
