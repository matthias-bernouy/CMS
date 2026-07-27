import { array, boolean, canonicalText, digest, enumValue, exactObject, nonNegativeInteger } from "../../helpers";
import { baseObservation, identifier, prefixedDigest } from "./shared";

export function validateTargetObservation(value: unknown): void {
    const observation = baseObservation(value, [
        "stateDigest",
        "schemaDigest",
        "dataDigest",
        "functionDigests",
        "bindingDigest",
    ]);
    optionalDigest(observation.stateDigest);
    optionalDigest(observation.schemaDigest);
    optionalDigest(observation.dataDigest);
    optionalDigest(observation.bindingDigest);
    const functions = array(observation.functionDigests).map((entry) => {
        const value = exactObject(entry, ["functionId", "digest"]);
        digest(value.digest);
        return identifier(value.functionId);
    });
    if (new Set(functions).size !== functions.length) {
        throw new TypeError("Repository candidate function observations are duplicated");
    }
}

export function validateEquivalenceObservation(value: unknown): void {
    const observation = baseObservation(value, [
        "freshStateDigest",
        "migratedStateDigest",
        "equivalent",
        "differences",
    ]);
    optionalDigest(observation.freshStateDigest);
    optionalDigest(observation.migratedStateDigest);
    if (observation.equivalent !== undefined) {
        boolean(observation.equivalent);
    }
    array(observation.differences).forEach((entry) => {
        const difference = exactObject(entry, ["surface", "path"], ["freshDigest", "migratedDigest"]);
        enumValue(difference.surface, ["schema", "data", "functions", "bindings", "ledger", "behavior"] as const);
        canonicalText(difference.path, 4_096);
        optionalDigest(difference.freshDigest);
        optionalDigest(difference.migratedDigest);
    });
}

export function validateLedgerObservation(value: unknown): void {
    const observation = baseObservation(value, [
        "sourceRevision",
        "targetRevision",
        "freshBaselineRecorded",
        "migrationAndLedgerAtomic",
        "checksumMismatchRejected",
        "emptyLedgerRejected",
        "rows",
    ]);
    optionalCount(observation.sourceRevision);
    optionalCount(observation.targetRevision);
    for (const key of [
        "freshBaselineRecorded",
        "migrationAndLedgerAtomic",
        "checksumMismatchRejected",
        "emptyLedgerRejected",
    ] as const) {
        if (observation[key] !== undefined) {
            boolean(observation[key]);
        }
    }
    const ids = array(observation.rows).map((entry) => {
        const row = exactObject(
            entry,
            ["migrationId", "checksum", "revision", "attemptId"],
            ["sourcePackageDigest", "targetPackageDigest"],
        );
        prefixedDigest(row.checksum);
        nonNegativeInteger(row.revision);
        identifier(row.attemptId);
        optionalDigest(row.sourcePackageDigest);
        optionalDigest(row.targetPackageDigest);
        return identifier(row.migrationId);
    });
    if (new Set(ids).size !== ids.length) {
        throw new TypeError("Repository candidate migration ledger contains duplicates");
    }
}

export function validateReplayObservation(value: unknown): void {
    const observation = baseObservation(value, [
        "firstStateDigest",
        "replayStateDigest",
        "unchanged",
        "ledgerRowsBefore",
        "ledgerRowsAfterFirstRun",
        "ledgerRowsAfterReplay",
    ]);
    optionalDigest(observation.firstStateDigest);
    optionalDigest(observation.replayStateDigest);
    if (observation.unchanged !== undefined) {
        boolean(observation.unchanged);
    }
    optionalCount(observation.ledgerRowsBefore);
    optionalCount(observation.ledgerRowsAfterFirstRun);
    optionalCount(observation.ledgerRowsAfterReplay);
}

function optionalDigest(value: unknown): void {
    if (value !== undefined) {
        digest(value);
    }
}

function optionalCount(value: unknown): void {
    if (value !== undefined) {
        nonNegativeInteger(value);
    }
}
