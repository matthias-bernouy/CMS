import type { PageIndexingEditorModel } from "cms-control/core/content/page/indexing/pageIndexingEditor";

export const EMPTY_MODEL: PageIndexingEditorModel = {
    configured: false,
    suggested: false,
    detectionStatus: "none",
    enabled: true,
    selection: "",
    selectionValid: true,
    availableVariables: [],
    candidates: [],
};

export function parseModel(value: string | null): PageIndexingEditorModel {
    try {
        return normalizeModel(JSON.parse(value ?? ""));
    } catch {
        try {
            return normalizeModel(JSON.parse(decodeURIComponent(value ?? "")));
        } catch {
            return EMPTY_MODEL;
        }
    }
}

function normalizeModel(value: unknown): PageIndexingEditorModel {
    if (!value || typeof value !== "object") {
        return EMPTY_MODEL;
    }
    const model = value as Partial<PageIndexingEditorModel>;
    return {
        ...EMPTY_MODEL,
        ...model,
        availableVariables: Array.isArray(model.availableVariables) ? model.availableVariables : [],
        candidates: Array.isArray(model.candidates) ? model.candidates : [],
    };
}
