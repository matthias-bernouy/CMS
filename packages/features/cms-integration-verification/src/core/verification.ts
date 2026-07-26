import {
    canonicalJsonBytes,
    resolveCanonicalFileSetLimits,
    sha256Hex,
    validateCanonicalFileSet,
    type CanonicalFileSet,
} from "@bernouy/cms-integration-packages";
import type {
    IntegrationVerificationEnvelopeV1,
    IntegrationVerificationManifestV1,
    IntegrationVerificationValidationOptions,
} from "../interfaces/verification";
import { INTEGRATION_VERIFICATION_SCHEMA } from "../interfaces/verification";
import { parseVerificationRunnerRequirement } from "./runner";
import { IntegrationVerificationContractError, wrapPackageValidation } from "./validation/errors";
import { parseVerificationJsonDocument } from "./validation/document";
import { assertContractIJson, assertUnique, boundedArray, strictRecord } from "./validation/structure";
import {
    assertVersionInRange,
    exactVersion,
    oneOf,
    packageKind,
    requiredText,
    sha256Digest,
    stableIdentifier,
    supportedVersionRange,
} from "./validation/values";

export function parseIntegrationVerificationEnvelope(
    input: string | Uint8Array,
    options: IntegrationVerificationValidationOptions = {},
): IntegrationVerificationEnvelopeV1 {
    const limits = resolveCanonicalFileSetLimits(options.limits);
    return validateIntegrationVerificationEnvelope(parseVerificationJsonDocument(input, limits.maxDocumentBytes), {
        limits,
    });
}

export function validateIntegrationVerificationEnvelope(
    value: unknown,
    options: IntegrationVerificationValidationOptions = {},
): IntegrationVerificationEnvelopeV1 {
    assertContractIJson(value);
    const limits = resolveCanonicalFileSetLimits(options.limits);
    const input = strictRecord(value, "$", ["schema", "target", "manifest", "files"]);
    if (input.schema !== INTEGRATION_VERIFICATION_SCHEMA) {
        throw new IntegrationVerificationContractError(
            "invalid_schema",
            `schema must be ${INTEGRATION_VERIFICATION_SCHEMA}`,
            "schema",
        );
    }
    const target = parseTarget(input.target);
    const files = wrapPackageValidation(() => validateCanonicalFileSet(input.files, { limits }));
    const manifest = parseManifest(input.manifest, files, target.version);
    const envelope: IntegrationVerificationEnvelopeV1 = {
        schema: INTEGRATION_VERIFICATION_SCHEMA,
        target,
        manifest,
        files,
    };
    if (canonicalJsonBytes(envelope).byteLength > limits.maxDocumentBytes) {
        throw new IntegrationVerificationContractError(
            "limit_exceeded",
            `canonical verification document exceeds ${limits.maxDocumentBytes} bytes`,
        );
    }
    return envelope;
}

export async function computeIntegrationVerificationDigest(value: unknown): Promise<string> {
    return sha256Hex(canonicalJsonBytes(validateIntegrationVerificationEnvelope(value)));
}

function parseTarget(value: unknown): IntegrationVerificationEnvelopeV1["target"] {
    const input = strictRecord(value, "target", ["kind", "version", "packageDigest"]);
    return {
        kind: packageKind(input.kind, "target.kind"),
        version: exactVersion(input.version, "target.version"),
        packageDigest: sha256Digest(input.packageDigest, "target.packageDigest"),
    };
}

function parseManifest(
    value: unknown,
    files: CanonicalFileSet,
    targetVersion: string,
): IntegrationVerificationManifestV1 {
    const input = strictRecord(value, "manifest", ["runnerRequirements", "contracts", "conformance", "fixtures"]);
    const runnerRequirements = boundedArray(
        input.runnerRequirements,
        "manifest.runnerRequirements",
        (entry, field) => parseVerificationRunnerRequirement(entry, field),
        { minimum: 1 },
    );
    const contracts = boundedArray(input.contracts, "manifest.contracts", (entry, field) =>
        parseContract(entry, field, files, targetVersion),
    );
    const conformance = boundedArray(input.conformance, "manifest.conformance", (entry, field) =>
        parseConformance(entry, field, files),
    );
    const fixtures = boundedArray(input.fixtures, "manifest.fixtures", (entry, field) =>
        referencedFile(entry, field, files, false),
    );
    assertUnique(
        runnerRequirements.map((entry) => entry.name),
        "manifest.runnerRequirements.name",
    );
    assertUnique(
        contracts.map((entry) => entry.contractId),
        "manifest.contracts.contractId",
    );
    assertUnique(
        conformance.map((entry) => entry.suiteId),
        "manifest.conformance.suiteId",
    );
    assertUnique(
        [...contracts.map((entry) => entry.contractId), ...conformance.map((entry) => entry.suiteId)],
        "manifest suite IDs",
    );
    assertUnique(fixtures, "manifest.fixtures");
    return {
        runnerRequirements: runnerRequirements.toSorted((left, right) => compareText(left.name, right.name)),
        contracts: contracts.toSorted((left, right) => compareText(left.contractId, right.contractId)),
        conformance: conformance.toSorted((left, right) => compareText(left.suiteId, right.suiteId)),
        fixtures: fixtures.toSorted(compareText),
    };
}

function parseContract(
    value: unknown,
    field: string,
    files: CanonicalFileSet,
    targetVersion: string,
): IntegrationVerificationManifestV1["contracts"][number] {
    const input = strictRecord(value, field, ["contractId", "entrypoint", "activeMajorRange"]);
    const activeMajorRange = supportedVersionRange(input.activeMajorRange, `${field}.activeMajorRange`);
    assertVersionInRange(targetVersion, activeMajorRange, `${field}.activeMajorRange`);
    return {
        contractId: stableIdentifier(input.contractId, `${field}.contractId`),
        entrypoint: referencedFile(input.entrypoint, `${field}.entrypoint`, files, true),
        activeMajorRange,
    };
}

function parseConformance(
    value: unknown,
    field: string,
    files: CanonicalFileSet,
): IntegrationVerificationManifestV1["conformance"][number] {
    const input = strictRecord(value, field, ["suiteId", "entrypoint"]);
    return {
        suiteId: stableIdentifier(input.suiteId, `${field}.suiteId`),
        entrypoint: referencedFile(input.entrypoint, `${field}.entrypoint`, files, true),
    };
}

function referencedFile(value: unknown, field: string, files: CanonicalFileSet, requireUtf8: boolean): string {
    const path = requiredText(value, field, 4_096);
    const file = files[path];
    if (!file) {
        throw new IntegrationVerificationContractError(
            "invalid_reference",
            `${field} does not reference a bundle file`,
            field,
        );
    }
    if (requireUtf8 && file.encoding !== "utf8") {
        throw new IntegrationVerificationContractError(
            "invalid_reference",
            `${field} must reference a UTF-8 file`,
            field,
        );
    }
    return path;
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
