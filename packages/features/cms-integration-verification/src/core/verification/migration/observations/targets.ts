import type {
    MigrationEquivalenceObservationV1,
    MigrationTargetObservationV1,
} from "../../../../interfaces/verification/migration";
import { boundedArray, strictRecord } from "../../../validation/structure";
import { oneOf, requiredText, sha256Digest, stableIdentifier } from "../../../validation/values";
import {
    assertCanonicalUniqueOrder,
    assertObservationPayload,
    invalid,
    MAX_MIGRATION_OBSERVATIONS,
    optionalDigest,
    parseObservationEvidence,
} from "../shared";

const DIFFERENCE_SURFACES = ["schema", "data", "functions", "bindings", "ledger", "behavior"] as const;

export function parseTargetObservation(value: unknown, field: string): MigrationTargetObservationV1 {
    const { input, evidence } = parseObservationEvidence(value, field, [
        "stateDigest",
        "schemaDigest",
        "dataDigest",
        "functionDigests",
        "bindingDigest",
    ]);
    const functionDigests = boundedArray(
        input.functionDigests,
        `${field}.functionDigests`,
        (entry, entryField) => {
            const item = strictRecord(entry, entryField, ["functionId", "digest"]);
            return {
                functionId: stableIdentifier(item.functionId, `${entryField}.functionId`),
                digest: sha256Digest(item.digest, `${entryField}.digest`),
            };
        },
        { maximum: MAX_MIGRATION_OBSERVATIONS },
    );
    assertCanonicalUniqueOrder(functionDigests, `${field}.functionDigests`, (entry) => entry.functionId);
    const stateDigest = optionalDigest(input.stateDigest, `${field}.stateDigest`);
    const schemaDigest = optionalDigest(input.schemaDigest, `${field}.schemaDigest`);
    const dataDigest = optionalDigest(input.dataDigest, `${field}.dataDigest`);
    const bindingDigest = optionalDigest(input.bindingDigest, `${field}.bindingDigest`);
    const hasPayload = Boolean(stateDigest || schemaDigest || dataDigest || bindingDigest || functionDigests.length);
    assertObservationPayload(evidence.status, field, hasPayload);
    if (evidence.status === "passed" && (!stateDigest || !schemaDigest)) {
        invalid(field, "must include stateDigest and schemaDigest when passed");
    }
    return {
        ...evidence,
        ...(stateDigest ? { stateDigest } : {}),
        ...(schemaDigest ? { schemaDigest } : {}),
        ...(dataDigest ? { dataDigest } : {}),
        functionDigests,
        ...(bindingDigest ? { bindingDigest } : {}),
    };
}

export function parseEquivalenceObservation(value: unknown, field: string): MigrationEquivalenceObservationV1 {
    const { input, evidence } = parseObservationEvidence(value, field, [
        "freshStateDigest",
        "migratedStateDigest",
        "equivalent",
        "differences",
    ]);
    const freshStateDigest = optionalDigest(input.freshStateDigest, `${field}.freshStateDigest`);
    const migratedStateDigest = optionalDigest(input.migratedStateDigest, `${field}.migratedStateDigest`);
    const equivalent =
        input.equivalent === undefined ? undefined : parseBoolean(input.equivalent, `${field}.equivalent`);
    const differences = boundedArray(input.differences, `${field}.differences`, parseDifference, {
        maximum: MAX_MIGRATION_OBSERVATIONS,
    });
    assertCanonicalUniqueOrder(differences, `${field}.differences`, (entry) => `${entry.surface}\0${entry.path}`);
    const hasPayload = Boolean(
        freshStateDigest || migratedStateDigest || equivalent !== undefined || differences.length,
    );
    assertObservationPayload(evidence.status, field, hasPayload);
    if (evidence.status === "passed" || evidence.status === "failed") {
        if (!freshStateDigest || !migratedStateDigest || equivalent === undefined) {
            invalid(field, `must include both state digests and equivalence when ${evidence.status}`);
        }
        if ((evidence.status === "passed") !== equivalent || equivalent === differences.length > 0) {
            invalid(field, "status, equivalent, and differences contradict each other");
        }
    }
    return {
        ...evidence,
        ...(freshStateDigest ? { freshStateDigest } : {}),
        ...(migratedStateDigest ? { migratedStateDigest } : {}),
        ...(equivalent === undefined ? {} : { equivalent }),
        differences,
    };
}

function parseDifference(value: unknown, field: string): MigrationEquivalenceObservationV1["differences"][number] {
    const input = strictRecord(value, field, ["surface", "path", "freshDigest", "migratedDigest"]);
    const freshDigest = optionalDigest(input.freshDigest, `${field}.freshDigest`);
    const migratedDigest = optionalDigest(input.migratedDigest, `${field}.migratedDigest`);
    if ((!freshDigest && !migratedDigest) || freshDigest === migratedDigest) {
        invalid(field, "must describe two different observed values");
    }
    return {
        surface: oneOf(input.surface, `${field}.surface`, DIFFERENCE_SURFACES),
        path: requiredText(input.path, `${field}.path`, 1_024),
        ...(freshDigest ? { freshDigest } : {}),
        ...(migratedDigest ? { migratedDigest } : {}),
    };
}

function parseBoolean(value: unknown, field: string): boolean {
    if (typeof value !== "boolean") {
        invalid(field, "must be a boolean");
    }
    return value;
}
