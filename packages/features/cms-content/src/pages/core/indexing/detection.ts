import { collectCmsQueryBindings } from "cms-content/pages/core/indexing/operationBindings";
import { parseSyncTarget } from "cms-content/blocs/core/markup/bindings";

export type PageIndexingCandidate = {
    contractId: string;
    capabilityId: string;
    inputParam: string;
    pageQueryParam: string;
};

export type PageIndexingDetectionStatus = "none" | "detected" | "ambiguous";
export type PageIndexingDetection = { status: PageIndexingDetectionStatus; candidates: PageIndexingCandidate[] };

/** Finds logical queries whose typed input binds one field to a public Page parameter. */
export function detectPageIndexingCandidates(html: string): PageIndexingDetection {
    const candidates = new Map<string, PageIndexingCandidate>();
    for (const binding of collectCmsQueryBindings(html)) {
        if (!binding.input) {
            continue;
        }
        for (const [inputParam, value] of Object.entries(binding.input)) {
            const target = value?.from === "state" ? parseSyncTarget(value.key) : null;
            if (!target || target.scope !== "param") {
                continue;
            }
            const candidate = {
                contractId: binding.contractId,
                capabilityId: binding.capabilityId,
                inputParam,
                pageQueryParam: target.key,
            };
            candidates.set(JSON.stringify(candidate), candidate);
        }
    }
    const detected = [...candidates.values()];
    return {
        status: detected.length === 0 ? "none" : detected.length === 1 ? "detected" : "ambiguous",
        candidates: detected,
    };
}
