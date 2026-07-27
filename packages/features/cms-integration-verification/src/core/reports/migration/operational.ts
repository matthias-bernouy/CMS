import type { MigrationOperationalEvidence } from "../../../interfaces/reports/migration";
import { strictRecord } from "../../validation/structure";
import { nonNegativeInteger, oneOf, requiredBoolean, sha256Digest, stableIdentifier } from "../../validation/values";
import { IntegrationVerificationContractError } from "../../validation/errors";

export function parseMigrationOperationalEvidence(value: unknown): MigrationOperationalEvidence {
    const input = strictRecord(value, "migrationReport.operationalEvidence", [
        "downtime",
        "drain",
        "rollback",
        "pointOfNoReturn",
        "cleanup",
    ]);
    return {
        downtime: parseDowntime(input.downtime),
        drain: parseDrain(input.drain),
        rollback: parseRollback(input.rollback),
        pointOfNoReturn: parsePointOfNoReturn(input.pointOfNoReturn),
        cleanup: parseCleanup(input.cleanup),
    };
}

function parseDowntime(value: unknown): MigrationOperationalEvidence["downtime"] {
    const input = strictRecord(value, "migrationReport.operationalEvidence.downtime", [
        "status",
        "observedSeconds",
        "evidenceDigest",
    ]);
    const status = oneOf(input.status, "migrationReport.operationalEvidence.downtime.status", [
        "not-measured",
        "zero-downtime",
        "bounded-downtime",
    ] as const);
    if (status === "not-measured") {
        if (input.observedSeconds !== undefined || input.evidenceDigest !== undefined) {
            throw invalid(
                "migrationReport.operationalEvidence.downtime",
                "must not fabricate a duration or digest when downtime was not measured",
            );
        }
        return { status };
    }
    const observedSeconds = nonNegativeInteger(
        input.observedSeconds,
        "migrationReport.operationalEvidence.downtime.observedSeconds",
    );
    if ((status === "zero-downtime") !== (observedSeconds === 0)) {
        throw invalid(
            "migrationReport.operationalEvidence.downtime.observedSeconds",
            `${status} has an inconsistent observed duration`,
        );
    }
    return {
        status,
        observedSeconds,
        evidenceDigest: sha256Digest(
            input.evidenceDigest,
            "migrationReport.operationalEvidence.downtime.evidenceDigest",
        ),
    };
}

function parseDrain(value: unknown): MigrationOperationalEvidence["drain"] {
    const input = strictRecord(value, "migrationReport.operationalEvidence.drain", [
        "cmsMediatedSeconds",
        "providerDirectSeconds",
    ]);
    return {
        ...(input.cmsMediatedSeconds === undefined
            ? {}
            : {
                  cmsMediatedSeconds: nonNegativeInteger(
                      input.cmsMediatedSeconds,
                      "migrationReport.operationalEvidence.drain.cmsMediatedSeconds",
                  ),
              }),
        ...(input.providerDirectSeconds === undefined
            ? {}
            : {
                  providerDirectSeconds: nonNegativeInteger(
                      input.providerDirectSeconds,
                      "migrationReport.operationalEvidence.drain.providerDirectSeconds",
                  ),
              }),
    };
}

function parseRollback(value: unknown): MigrationOperationalEvidence["rollback"] {
    const input = strictRecord(value, "migrationReport.operationalEvidence.rollback", [
        "capability",
        "verified",
        "evidenceDigest",
    ]);
    const capability = oneOf(input.capability, "migrationReport.operationalEvidence.rollback.capability", [
        "available",
        "unavailable",
        "not-applicable",
    ] as const);
    const verified = requiredBoolean(input.verified, "migrationReport.operationalEvidence.rollback.verified");
    const evidenceDigest =
        input.evidenceDigest === undefined
            ? undefined
            : sha256Digest(input.evidenceDigest, "migrationReport.operationalEvidence.rollback.evidenceDigest");
    if (verified !== Boolean(evidenceDigest) || (verified && capability !== "available")) {
        throw invalid(
            "migrationReport.operationalEvidence.rollback",
            "verified rollback requires available capability and exact evidence, and unverified rollback must carry none",
        );
    }
    return { capability, verified, ...(evidenceDigest ? { evidenceDigest } : {}) };
}

function parsePointOfNoReturn(value: unknown): MigrationOperationalEvidence["pointOfNoReturn"] {
    const input = strictRecord(value, "migrationReport.operationalEvidence.pointOfNoReturn", [
        "phase",
        "observation",
        "evidenceDigest",
    ]);
    const observation = oneOf(input.observation, "migrationReport.operationalEvidence.pointOfNoReturn.observation", [
        "crossed",
        "not-crossed",
        "not-observed",
    ] as const);
    const evidenceDigest =
        input.evidenceDigest === undefined
            ? undefined
            : sha256Digest(input.evidenceDigest, "migrationReport.operationalEvidence.pointOfNoReturn.evidenceDigest");
    if ((observation === "not-observed") === Boolean(evidenceDigest)) {
        throw invalid(
            "migrationReport.operationalEvidence.pointOfNoReturn",
            "an observed transition requires evidence and an unobserved transition must carry none",
        );
    }
    return {
        phase: stableIdentifier(input.phase, "migrationReport.operationalEvidence.pointOfNoReturn.phase"),
        observation,
        ...(evidenceDigest ? { evidenceDigest } : {}),
    };
}

function parseCleanup(value: unknown): MigrationOperationalEvidence["cleanup"] {
    const input = strictRecord(value, "migrationReport.operationalEvidence.cleanup", [
        "delaySeconds",
        "observed",
        "evidenceDigest",
    ]);
    const observed = requiredBoolean(input.observed, "migrationReport.operationalEvidence.cleanup.observed");
    const evidenceDigest =
        input.evidenceDigest === undefined
            ? undefined
            : sha256Digest(input.evidenceDigest, "migrationReport.operationalEvidence.cleanup.evidenceDigest");
    if (observed !== Boolean(evidenceDigest)) {
        throw invalid(
            "migrationReport.operationalEvidence.cleanup",
            "observed cleanup requires exact evidence and unobserved cleanup must carry none",
        );
    }
    return {
        ...(input.delaySeconds === undefined
            ? {}
            : {
                  delaySeconds: nonNegativeInteger(
                      input.delaySeconds,
                      "migrationReport.operationalEvidence.cleanup.delaySeconds",
                  ),
              }),
        observed,
        ...(evidenceDigest ? { evidenceDigest } : {}),
    };
}

function invalid(field: string, message: string): IntegrationVerificationContractError {
    return new IntegrationVerificationContractError("invalid_contract", `${field} ${message}`, field);
}
