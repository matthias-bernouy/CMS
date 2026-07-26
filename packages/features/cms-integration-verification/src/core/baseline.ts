import { identifyObservedSchemaContract, parseObservedSchemaContractV1 } from "@bernouy/cms-integrations";
import type { ReviewedSchemaBaselineV1 } from "../interfaces/baseline";
import { REVIEWED_SCHEMA_BASELINE_SCHEMA } from "../interfaces/baseline";
import { pinnedRunner, parseVerificationPolicyIdentity } from "./runner";
import { parseReportHistoryFields, parseReportProvenance, parseVersionDigestReferences } from "./reports/shared";
import { IntegrationVerificationContractError } from "./validation/errors";
import { assertContractIJson, strictRecord } from "./validation/structure";
import {
    exactVersion,
    packageKind,
    requiredText,
    sha256Digest,
    stableIdentifier,
    timestamp,
} from "./validation/values";

const BASELINE_FIELDS = [
    "schema",
    "reportId",
    "revisionType",
    "origin",
    "createdAt",
    "supersedes",
    "kind",
    "version",
    "packageDigest",
    "connectorKey",
    "lineageId",
    "legacySelector",
    "dependencies",
    "observedSchema",
    "observedSchemaDigest",
    "generator",
    "environment",
    "policy",
    "generatedAt",
    "provenance",
] as const;

export async function parseReviewedSchemaBaseline(value: unknown): Promise<ReviewedSchemaBaselineV1> {
    assertContractIJson(value);
    const input = strictRecord(value, "baseline", BASELINE_FIELDS);
    if (input.schema !== REVIEWED_SCHEMA_BASELINE_SCHEMA) {
        throw new IntegrationVerificationContractError(
            "invalid_schema",
            `baseline.schema must be ${REVIEWED_SCHEMA_BASELINE_SCHEMA}`,
            "baseline.schema",
        );
    }
    const connectorKey = stableIdentifier(input.connectorKey, "baseline.connectorKey");
    const lineageId = stableIdentifier(input.lineageId, "baseline.lineageId");
    const observedSchema = parseObservedSchema(input.observedSchema);
    if (observedSchema.owner.connectorKey !== connectorKey || observedSchema.owner.lineageId !== lineageId) {
        throw new IntegrationVerificationContractError(
            "invalid_reference",
            "baseline observed schema owner must match connectorKey and lineageId",
            "baseline.observedSchema.owner",
        );
    }
    const observedSchemaDigest = sha256Digest(input.observedSchemaDigest, "baseline.observedSchemaDigest");
    const actualDigest = (await identifyObservedSchemaContract(observedSchema)).digest;
    if (observedSchemaDigest !== actualDigest) {
        throw new IntegrationVerificationContractError(
            "invalid_digest",
            "baseline.observedSchemaDigest does not match the canonical observed schema",
            "baseline.observedSchemaDigest",
        );
    }
    return {
        schema: REVIEWED_SCHEMA_BASELINE_SCHEMA,
        ...parseReportHistoryFields(input, "baseline"),
        kind: packageKind(input.kind, "baseline.kind"),
        version: exactVersion(input.version, "baseline.version"),
        packageDigest: sha256Digest(input.packageDigest, "baseline.packageDigest"),
        connectorKey,
        lineageId,
        legacySelector: parseLegacySelector(input.legacySelector),
        dependencies: parseVersionDigestReferences(input.dependencies, "baseline.dependencies"),
        observedSchema,
        observedSchemaDigest,
        generator: pinnedRunner(input.generator, "baseline.generator"),
        environment: parseEnvironment(input.environment),
        policy: parseVerificationPolicyIdentity(input.policy, "baseline.policy"),
        generatedAt: timestamp(input.generatedAt, "baseline.generatedAt"),
        provenance: parseReportProvenance(input.provenance, "baseline.provenance"),
    };
}

function parseLegacySelector(value: unknown): ReviewedSchemaBaselineV1["legacySelector"] {
    const input = strictRecord(value, "baseline.legacySelector", ["provider", "root"]);
    return {
        provider: stableIdentifier(input.provider, "baseline.legacySelector.provider"),
        ...(input.root === undefined ? {} : { root: requiredText(input.root, "baseline.legacySelector.root", 4_096) }),
    };
}

function parseEnvironment(value: unknown): ReviewedSchemaBaselineV1["environment"] {
    const input = strictRecord(value, "baseline.environment", ["digest", "postgresVersion"]);
    return {
        digest: sha256Digest(input.digest, "baseline.environment.digest"),
        postgresVersion: requiredText(input.postgresVersion, "baseline.environment.postgresVersion", 128),
    };
}

function parseObservedSchema(value: unknown): ReviewedSchemaBaselineV1["observedSchema"] {
    try {
        return parseObservedSchemaContractV1(value, "baseline.observedSchema");
    } catch (error) {
        throw new IntegrationVerificationContractError(
            "invalid_contract",
            error instanceof Error ? error.message : "baseline.observedSchema is invalid",
            "baseline.observedSchema",
        );
    }
}
