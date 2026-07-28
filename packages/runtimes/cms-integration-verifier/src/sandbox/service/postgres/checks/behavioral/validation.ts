import type { BehavioralRlsProbeV1 } from "@bernouy/cms-integration-verification";
import type { BehavioralRlsExposedRelation } from "./types";

export type BehavioralRlsCoverage = Readonly<{
    plannedCount: number;
    exposedCount: number;
    exact: boolean;
}>;

export function behavioralRlsCoverage(
    probes: readonly BehavioralRlsProbeV1[],
    exposedRelations: readonly BehavioralRlsExposedRelation[],
): BehavioralRlsCoverage {
    const planned = probes.map(relationIdentity).toSorted();
    const exposed = exposedRelations.map(relationIdentity).toSorted();
    const exact =
        new Set(planned).size === planned.length &&
        new Set(exposed).size === exposed.length &&
        planned.length === exposed.length &&
        planned.every((identity, index) => identity === exposed[index]);
    return { plannedCount: planned.length, exposedCount: exposed.length, exact };
}

function relationIdentity(relation: BehavioralRlsExposedRelation): string {
    return `${relation.namespace}\0${relation.relation}`;
}
