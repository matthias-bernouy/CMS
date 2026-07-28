import type {
    MigrationLedgerObservationV1,
    MigrationReplayObservationV1,
} from "../../../../interfaces/verification/migration";
import { assertUnique, boundedArray, strictRecord } from "../../../validation/structure";
import { nonNegativeInteger, requiredBoolean, sha256Digest, stableIdentifier } from "../../../validation/values";
import {
    assertCanonicalUniqueOrder,
    assertObservationPayload,
    invalid,
    MAX_MIGRATION_DESCRIPTORS,
    migrationChecksum,
    optionalDigest,
    parseObservationEvidence,
} from "../shared";

export function parseLedgerObservation(value: unknown, field: string): MigrationLedgerObservationV1 {
    const { input, evidence } = parseObservationEvidence(value, field, [
        "sourceRevision",
        "targetRevision",
        "freshBaselineRecorded",
        "migrationAndLedgerAtomic",
        "checksumMismatchRejected",
        "emptyLedgerRejected",
        "rows",
    ]);
    const sourceRevision = optionalInteger(input.sourceRevision, `${field}.sourceRevision`);
    const targetRevision = optionalInteger(input.targetRevision, `${field}.targetRevision`);
    const freshBaselineRecorded = optionalBoolean(input.freshBaselineRecorded, `${field}.freshBaselineRecorded`);
    const migrationAndLedgerAtomic = optionalBoolean(
        input.migrationAndLedgerAtomic,
        `${field}.migrationAndLedgerAtomic`,
    );
    const checksumMismatchRejected = optionalBoolean(
        input.checksumMismatchRejected,
        `${field}.checksumMismatchRejected`,
    );
    const emptyLedgerRejected = optionalBoolean(input.emptyLedgerRejected, `${field}.emptyLedgerRejected`);
    const rows = boundedArray(input.rows, `${field}.rows`, parseLedgerRow, {
        maximum: MAX_MIGRATION_DESCRIPTORS,
    });
    assertUnique(
        rows.map((entry) => entry.migrationId),
        `${field}.rows.migrationId`,
    );
    assertCanonicalUniqueOrder(rows, `${field}.rows`, (entry) => `${numericKey(entry.revision)}\0${entry.migrationId}`);
    const values = [freshBaselineRecorded, migrationAndLedgerAtomic, checksumMismatchRejected, emptyLedgerRejected];
    const hasPayload = Boolean(
        sourceRevision !== undefined ||
            targetRevision !== undefined ||
            rows.length ||
            values.some((v) => v !== undefined),
    );
    assertObservationPayload(evidence.status, field, hasPayload);
    if (evidence.status === "passed" || evidence.status === "failed") {
        if (
            sourceRevision === undefined ||
            targetRevision === undefined ||
            values.some((entry) => entry === undefined)
        ) {
            invalid(field, `must contain complete ledger facts when ${evidence.status}`);
        }
        if ((evidence.status === "passed") !== values.every(Boolean)) {
            invalid(field, "status contradicts the recorded ledger facts");
        }
    }
    return {
        ...evidence,
        ...(sourceRevision === undefined ? {} : { sourceRevision }),
        ...(targetRevision === undefined ? {} : { targetRevision }),
        ...(freshBaselineRecorded === undefined ? {} : { freshBaselineRecorded }),
        ...(migrationAndLedgerAtomic === undefined ? {} : { migrationAndLedgerAtomic }),
        ...(checksumMismatchRejected === undefined ? {} : { checksumMismatchRejected }),
        ...(emptyLedgerRejected === undefined ? {} : { emptyLedgerRejected }),
        rows,
    };
}

export function parseReplayObservation(value: unknown, field: string): MigrationReplayObservationV1 {
    const { input, evidence } = parseObservationEvidence(value, field, [
        "firstStateDigest",
        "replayStateDigest",
        "unchanged",
        "ledgerRowsBefore",
        "ledgerRowsAfterFirstRun",
        "ledgerRowsAfterReplay",
    ]);
    const firstStateDigest = optionalDigest(input.firstStateDigest, `${field}.firstStateDigest`);
    const replayStateDigest = optionalDigest(input.replayStateDigest, `${field}.replayStateDigest`);
    const unchanged = optionalBoolean(input.unchanged, `${field}.unchanged`);
    const ledgerRowsBefore = optionalInteger(input.ledgerRowsBefore, `${field}.ledgerRowsBefore`);
    const ledgerRowsAfterFirstRun = optionalInteger(input.ledgerRowsAfterFirstRun, `${field}.ledgerRowsAfterFirstRun`);
    const ledgerRowsAfterReplay = optionalInteger(input.ledgerRowsAfterReplay, `${field}.ledgerRowsAfterReplay`);
    const hasPayload = Boolean(
        firstStateDigest ||
            replayStateDigest ||
            unchanged !== undefined ||
            ledgerRowsBefore !== undefined ||
            ledgerRowsAfterFirstRun !== undefined ||
            ledgerRowsAfterReplay !== undefined,
    );
    assertObservationPayload(evidence.status, field, hasPayload);
    if (evidence.status === "passed" || evidence.status === "failed") {
        if (
            !firstStateDigest ||
            !replayStateDigest ||
            unchanged === undefined ||
            ledgerRowsBefore === undefined ||
            ledgerRowsAfterFirstRun === undefined ||
            ledgerRowsAfterReplay === undefined
        ) {
            invalid(field, `must contain complete replay facts when ${evidence.status}`);
        }
        const observedUnchanged =
            firstStateDigest === replayStateDigest && ledgerRowsAfterFirstRun === ledgerRowsAfterReplay;
        if (unchanged !== observedUnchanged || (evidence.status === "passed") !== unchanged) {
            invalid(field, "status or unchanged contradicts the observed replay state");
        }
    }
    return {
        ...evidence,
        ...(firstStateDigest ? { firstStateDigest } : {}),
        ...(replayStateDigest ? { replayStateDigest } : {}),
        ...(unchanged === undefined ? {} : { unchanged }),
        ...(ledgerRowsBefore === undefined ? {} : { ledgerRowsBefore }),
        ...(ledgerRowsAfterFirstRun === undefined ? {} : { ledgerRowsAfterFirstRun }),
        ...(ledgerRowsAfterReplay === undefined ? {} : { ledgerRowsAfterReplay }),
    };
}

function parseLedgerRow(value: unknown, field: string): MigrationLedgerObservationV1["rows"][number] {
    const input = strictRecord(value, field, [
        "migrationId",
        "checksum",
        "revision",
        "attemptId",
        "sourcePackageDigest",
        "targetPackageDigest",
    ]);
    return {
        migrationId: stableIdentifier(input.migrationId, `${field}.migrationId`),
        checksum: migrationChecksum(input.checksum, `${field}.checksum`),
        revision: nonNegativeInteger(input.revision, `${field}.revision`),
        attemptId: stableIdentifier(input.attemptId, `${field}.attemptId`),
        ...(input.sourcePackageDigest === undefined
            ? {}
            : { sourcePackageDigest: sha256Digest(input.sourcePackageDigest, `${field}.sourcePackageDigest`) }),
        ...(input.targetPackageDigest === undefined
            ? {}
            : { targetPackageDigest: sha256Digest(input.targetPackageDigest, `${field}.targetPackageDigest`) }),
    };
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
    return value === undefined ? undefined : requiredBoolean(value, field);
}

function optionalInteger(value: unknown, field: string): number | undefined {
    return value === undefined ? undefined : nonNegativeInteger(value, field);
}

function numericKey(value: number): string {
    return value.toString().padStart(16, "0");
}
