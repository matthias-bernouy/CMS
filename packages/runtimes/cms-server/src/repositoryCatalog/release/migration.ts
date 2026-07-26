import type { PublicRepositoryMigrationEvidence } from "@bernouy/cms-repository";
import { boolean, count, digest, digestIdentity, enumText, runner, strictRecord, text } from "./values";

const CHECK_OUTCOMES = ["passed", "failed", "not-supported", "not-applicable", "infrastructure-failure"] as const;

export function parsePublicMigration(value: unknown): PublicRepositoryMigrationEvidence {
    const source = strictRecord(value, [
        "checks",
        "connectorKey",
        "cutover",
        "delayedCleanupVerified",
        "environmentDigest",
        "lineageId",
        "migrationRevision",
        "origin",
        "outcome",
        "pointOfNoReturn",
        "reportDigest",
        "reportId",
        "rollback",
        "runner",
        "source",
        "supportedSourceRange",
    ]);
    const cutover = strictRecord(source.cutover, ["cmsMediated", "providerDirect"]);
    return {
        reportId: text(source.reportId, 256),
        reportDigest: digest(source.reportDigest),
        origin: enumText(source.origin, ["admission", "legacy-backfill"] as const),
        source: digestIdentity(source.source),
        supportedSourceRange: text(source.supportedSourceRange, 1_024),
        connectorKey: text(source.connectorKey, 256),
        lineageId: text(source.lineageId, 256),
        migrationRevision: count(source.migrationRevision),
        outcome: enumText(source.outcome, ["passed", "failed", "infrastructure-failure"] as const),
        runner: runner(source.runner),
        environmentDigest: digest(source.environmentDigest),
        checks: parseChecks(source.checks),
        cutover: {
            cmsMediated: enumText(cutover.cmsMediated, ["binding-revision", "expand-in-code", "not-applicable"]),
            providerDirect: enumText(cutover.providerDirect, ["provider-cutover", "expand-in-code", "not-applicable"]),
        },
        rollback: enumText(source.rollback, ["available", "unavailable", "not-applicable"]),
        pointOfNoReturn: text(source.pointOfNoReturn, 16_384),
        delayedCleanupVerified: boolean(source.delayedCleanupVerified),
    };
}

function parseChecks(value: unknown): PublicRepositoryMigrationEvidence["checks"] {
    const source = strictRecord(value, [
        "equivalence",
        "failureInjection",
        "freshInstall",
        "migratedState",
        "resumption",
    ]);
    return Object.fromEntries(Object.entries(source).map(([name, check]) => [name, parseCheck(check)]));
}

function parseCheck(value: unknown): Readonly<{ outcome: string; evidenceDigest?: string }> {
    const source = strictRecord(value, ["outcome"], ["evidenceDigest"]);
    return {
        outcome: enumText(source.outcome, CHECK_OUTCOMES),
        ...(source.evidenceDigest === undefined ? {} : { evidenceDigest: digest(source.evidenceDigest) }),
    };
}
