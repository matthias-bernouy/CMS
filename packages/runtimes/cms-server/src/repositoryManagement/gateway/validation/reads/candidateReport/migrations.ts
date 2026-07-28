import { array, assertEqual, canonicalText, digest, exactObject, nonNegativeInteger } from "../../helpers";
import { validateMigrationCutover } from "./migrationCutover";
import {
    validateEquivalenceObservation,
    validateLedgerObservation,
    validateReplayObservation,
    validateTargetObservation,
} from "./migrationState";
import type { CandidateReportIdentity } from "./shared";
import { identifier, versionReference } from "./shared";

export function validateCandidateMigrations(value: unknown, identity: CandidateReportIdentity): void {
    const inputDigests = array(value, 256).map((entry) => validateMigration(entry, identity));
    if (new Set(inputDigests).size !== inputDigests.length) {
        throw new TypeError("Repository candidate migration inputs are duplicated");
    }
}

function validateMigration(value: unknown, identity: CandidateReportIdentity): string {
    const migration = exactObject(
        value,
        [
            "migrationInputDigest",
            "source",
            "target",
            "connectorKey",
            "lineageId",
            "sourceMigrationRevision",
            "targetMigrationRevision",
            "supportedSourceRange",
        ],
        ["result"],
    );
    const source = versionReference(migration.source);
    const target = versionReference(migration.target);
    assertEqual(source.kind, identity.kind);
    assertEqual(target.kind, identity.kind);
    assertEqual(target.version, identity.version);
    assertEqual(target.packageDigest, identity.packageDigest);
    identifier(migration.connectorKey);
    identifier(migration.lineageId);
    nonNegativeInteger(migration.sourceMigrationRevision);
    nonNegativeInteger(migration.targetMigrationRevision);
    canonicalText(migration.supportedSourceRange, 512);
    if (migration.result !== undefined) {
        validateMigrationResult(migration.result, identity);
    }
    return digest(migration.migrationInputDigest);
}

function validateMigrationResult(value: unknown, identity: CandidateReportIdentity): void {
    const result = exactObject(value, [
        "runnerDigest",
        "environmentDigest",
        "freshTarget",
        "migratedTarget",
        "equivalence",
        "ledger",
        "replay",
        "cutover",
    ]);
    digest(result.runnerDigest);
    digest(result.environmentDigest);
    validateTargetObservation(result.freshTarget);
    validateTargetObservation(result.migratedTarget);
    validateEquivalenceObservation(result.equivalence);
    validateLedgerObservation(result.ledger);
    validateReplayObservation(result.replay);
    validateMigrationCutover(result.cutover, identity);
}
