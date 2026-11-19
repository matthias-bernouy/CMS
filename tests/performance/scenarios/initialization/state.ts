import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../queries/types";

/** Mongo route recovery advances settingsRevision once when the instance runtime opens. */
export function expectedAfterRestarts(baseline: Readonly<Record<string, unknown>>, restarts: number) {
    const settings = requireRecord(baseline.settings);
    assertCondition(Number.isSafeInteger(restarts) && restarts >= 0 && Number.isSafeInteger(settings.revision));
    const revision = Number(settings.revision) + restarts;
    assertCondition(Number.isSafeInteger(revision));
    return { ...baseline, settings: { ...settings, revision } };
}

/** The sequential sampler checks each completed restart, including refusals, before proceeding. */
export function initializationStateGuard(before: Readonly<Record<string, unknown>>, cold: boolean) {
    let completedRestarts = 0;
    const expected = (): Readonly<Record<string, unknown>> =>
        cold ? expectedAfterRestarts(before, completedRestarts) : before;
    return {
        expected,
        async restart(run: () => Promise<unknown>) {
            await run();
            completedRestarts++;
        },
        changed(current: Readonly<Record<string, unknown>>) {
            const baseline = expected();
            return Object.keys(baseline).filter(
                (field) => canonicalizeIJson(current[field]) !== canonicalizeIJson(baseline[field]),
            );
        },
    };
}
