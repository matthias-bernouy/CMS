import type { PublicRepositoryMigrationEvidence } from "@bernouy/cms-repository";
import { boolean, count, digest, digestIdentity, enumText, invalid, runner, strictRecord, text } from "./values";

const CHECK_OUTCOMES = ["passed", "failed", "not-supported", "not-applicable", "infrastructure-failure"] as const;

export function parsePublicMigration(value: unknown): PublicRepositoryMigrationEvidence {
    const source = strictRecord(
        value,
        [
            "checks",
            "connectorKey",
            "cutover",
            "cutoverEvidence",
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
        ],
        ["operationalEvidence"],
    );
    const cutover = strictRecord(source.cutover, ["cmsMediated", "providerDirect"]);
    const parsedCutover = {
        cmsMediated: enumText(cutover.cmsMediated, ["binding-revision", "expand-in-code", "not-applicable"]),
        providerDirect: enumText(cutover.providerDirect, ["provider-cutover", "expand-in-code", "not-applicable"]),
    };
    const cutoverEvidence = parseCutoverEvidence(source.cutoverEvidence, parsedCutover);
    const rollback = enumText(source.rollback, ["available", "unavailable", "not-applicable"] as const);
    const pointOfNoReturn = text(source.pointOfNoReturn, 16_384);
    const delayedCleanupVerified = boolean(source.delayedCleanupVerified);
    const operationalEvidence =
        source.operationalEvidence === undefined ? undefined : parseOperationalEvidence(source.operationalEvidence);
    if (
        operationalEvidence &&
        (operationalEvidence.rollback.capability !== rollback ||
            operationalEvidence.pointOfNoReturn.phase !== pointOfNoReturn ||
            operationalEvidence.cleanup.observed !== delayedCleanupVerified)
    ) {
        invalid();
    }
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
        cutover: parsedCutover,
        cutoverEvidence,
        rollback,
        pointOfNoReturn,
        delayedCleanupVerified,
        ...(operationalEvidence ? { operationalEvidence } : {}),
    };
}

function parseOperationalEvidence(
    value: unknown,
): NonNullable<PublicRepositoryMigrationEvidence["operationalEvidence"]> {
    const source = strictRecord(value, ["cleanup", "downtime", "drain", "pointOfNoReturn", "rollback"]);
    const downtime = strictRecord(source.downtime, ["status"], ["evidenceDigest", "observedSeconds"]);
    const downtimeStatus = enumText(downtime.status, ["not-measured", "zero-downtime", "bounded-downtime"] as const);
    const observedDowntimeSeconds =
        downtime.observedSeconds === undefined ? undefined : count(downtime.observedSeconds);
    const drain = strictRecord(source.drain, [], ["cmsMediatedSeconds", "providerDirectSeconds"]);
    const rollback = strictRecord(source.rollback, ["capability", "verified"], ["evidenceDigest"]);
    const pointOfNoReturn = strictRecord(source.pointOfNoReturn, ["observation", "phase"], ["evidenceDigest"]);
    const cleanup = strictRecord(source.cleanup, ["observed"], ["delaySeconds", "evidenceDigest"]);
    const rollbackVerified = boolean(rollback.verified);
    const rollbackDigest = rollback.evidenceDigest === undefined ? undefined : digest(rollback.evidenceDigest);
    const pointObservation = enumText(pointOfNoReturn.observation, ["crossed", "not-crossed", "not-observed"] as const);
    const pointDigest =
        pointOfNoReturn.evidenceDigest === undefined ? undefined : digest(pointOfNoReturn.evidenceDigest);
    const cleanupObserved = boolean(cleanup.observed);
    const cleanupDigest = cleanup.evidenceDigest === undefined ? undefined : digest(cleanup.evidenceDigest);
    if (
        (downtimeStatus === "not-measured" &&
            (downtime.observedSeconds !== undefined || downtime.evidenceDigest !== undefined)) ||
        (downtimeStatus !== "not-measured" &&
            (observedDowntimeSeconds === undefined ||
                (downtimeStatus === "zero-downtime") !== (observedDowntimeSeconds === 0))) ||
        rollbackVerified !== Boolean(rollbackDigest) ||
        (rollbackVerified && rollback.capability !== "available") ||
        (pointObservation === "not-observed") === Boolean(pointDigest) ||
        cleanupObserved !== Boolean(cleanupDigest)
    ) {
        invalid();
    }
    return {
        downtime:
            downtimeStatus === "not-measured"
                ? { status: downtimeStatus }
                : {
                      status: downtimeStatus,
                      observedSeconds: observedDowntimeSeconds!,
                      evidenceDigest: digest(downtime.evidenceDigest),
                  },
        drain: {
            ...(drain.cmsMediatedSeconds === undefined ? {} : { cmsMediatedSeconds: count(drain.cmsMediatedSeconds) }),
            ...(drain.providerDirectSeconds === undefined
                ? {}
                : { providerDirectSeconds: count(drain.providerDirectSeconds) }),
        },
        rollback: {
            capability: enumText(rollback.capability, ["available", "unavailable", "not-applicable"] as const),
            verified: rollbackVerified,
            ...(rollbackDigest ? { evidenceDigest: rollbackDigest } : {}),
        },
        pointOfNoReturn: {
            phase: text(pointOfNoReturn.phase, 256),
            observation: pointObservation,
            ...(pointDigest ? { evidenceDigest: pointDigest } : {}),
        },
        cleanup: {
            ...(cleanup.delaySeconds === undefined ? {} : { delaySeconds: count(cleanup.delaySeconds) }),
            observed: cleanupObserved,
            ...(cleanupDigest ? { evidenceDigest: cleanupDigest } : {}),
        },
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

function parseCutoverEvidence(
    value: unknown,
    cutover: PublicRepositoryMigrationEvidence["cutover"],
): PublicRepositoryMigrationEvidence["cutoverEvidence"] {
    const source = strictRecord(value, ["activation", "cmsMediated", "providerDirect"]);
    const evidence = {
        cmsMediated: parseCheck(source.cmsMediated),
        providerDirect: parseCheck(source.providerDirect),
        activation: parseCheck(source.activation),
    };
    if (
        (cutover.cmsMediated === "not-applicable") !== (evidence.cmsMediated.outcome === "not-applicable") ||
        (cutover.providerDirect === "not-applicable") !== (evidence.providerDirect.outcome === "not-applicable")
    ) {
        invalid();
    }
    return evidence;
}

function parseCheck(value: unknown): Readonly<{ outcome: string; evidenceDigest?: string }> {
    const source = strictRecord(value, ["outcome"], ["evidenceDigest"]);
    const outcome = enumText(source.outcome, CHECK_OUTCOMES);
    const evidenceDigest = source.evidenceDigest === undefined ? undefined : digest(source.evidenceDigest);
    if (
        ((outcome === "passed" || outcome === "failed") && evidenceDigest === undefined) ||
        (outcome === "not-supported" && evidenceDigest !== undefined)
    ) {
        invalid();
    }
    return {
        outcome,
        ...(evidenceDigest ? { evidenceDigest } : {}),
    };
}
