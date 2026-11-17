import { assertCondition, requireRecord } from "../queries/types";

/** Mongo route recovery advances settingsRevision once when the instance runtime opens. */
export function expectedAfterRestarts(baseline: Readonly<Record<string, unknown>>, restarts: number) {
    const settings = requireRecord(baseline.settings);
    assertCondition(Number.isSafeInteger(restarts) && restarts >= 0 && Number.isSafeInteger(settings.revision));
    const revision = Number(settings.revision) + restarts;
    assertCondition(Number.isSafeInteger(revision));
    return { ...baseline, settings: { ...settings, revision } };
}
