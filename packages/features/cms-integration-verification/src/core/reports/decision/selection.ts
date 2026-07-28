import type {
    IdentifiedStatefulChangeSelectionV1,
    StatefulChangeSelectionV1,
} from "../../../interfaces/reports/decision";
import { STATEFUL_CHANGE_SELECTION_SCHEMA } from "../../../interfaces/reports/decision";
import { parseVerificationPolicyIdentity } from "../../runner";
import { IntegrationVerificationContractError } from "../../validation/errors";
import { assertContractIJson, assertUnique, boundedArray, strictRecord } from "../../validation/structure";
import { sha256Digest } from "../../validation/values";
import { identifyCanonicalVerificationContract } from "../../verification/shared";
import { parseVersionDigestReference } from "../shared";
import {
    compareRequiredMigration,
    migrationRequirementKey,
    parseReportReference,
    parseRequiredMigration,
} from "./references";

export function parseStatefulChangeSelection(value: unknown): StatefulChangeSelectionV1 {
    assertContractIJson(value);
    const input = strictRecord(value, "statefulChangeSelection", [
        "schema",
        "selector",
        "policySnapshotDigest",
        "target",
        "compatibilityReport",
        "requiredMigrations",
    ]);
    if (input.schema !== STATEFUL_CHANGE_SELECTION_SCHEMA) {
        throw invalid(`schema must be ${STATEFUL_CHANGE_SELECTION_SCHEMA}`, "invalid_schema");
    }
    const target = parseVersionDigestReference(input.target, "statefulChangeSelection.target");
    const requiredMigrations = boundedArray(
        input.requiredMigrations,
        "statefulChangeSelection.requiredMigrations",
        parseRequiredMigration,
    ).toSorted(compareRequiredMigration);
    assertUnique(
        requiredMigrations.map((entry) => migrationRequirementKey(entry)),
        "statefulChangeSelection.requiredMigrations",
    );
    if (
        requiredMigrations.some(
            (entry) => entry.source.kind !== target.kind || entry.source.packageDigest === target.packageDigest,
        )
    ) {
        throw invalid(
            "requiredMigrations must reference a different source package of the target kind",
            "invalid_reference",
        );
    }
    return {
        schema: STATEFUL_CHANGE_SELECTION_SCHEMA,
        selector: parseVerificationPolicyIdentity(input.selector, "statefulChangeSelection.selector"),
        policySnapshotDigest: sha256Digest(input.policySnapshotDigest, "statefulChangeSelection.policySnapshotDigest"),
        target,
        compatibilityReport: parseReportReference(
            input.compatibilityReport,
            "statefulChangeSelection.compatibilityReport",
        ),
        requiredMigrations,
    };
}

export async function identifyStatefulChangeSelection(value: unknown): Promise<IdentifiedStatefulChangeSelectionV1> {
    const selection = parseStatefulChangeSelection(value);
    const identified = await identifyCanonicalVerificationContract(selection);
    return { selection, canonicalBytes: identified.canonicalBytes, digest: identified.digest };
}

function invalid(
    message: string,
    code: "invalid_contract" | "invalid_reference" | "invalid_schema" = "invalid_contract",
): IntegrationVerificationContractError {
    return new IntegrationVerificationContractError(
        code,
        `statefulChangeSelection.${message}`,
        "statefulChangeSelection",
    );
}
