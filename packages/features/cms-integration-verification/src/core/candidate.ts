import {
    DEFAULT_CANONICAL_FILE_SET_LIMITS,
    canonicalJsonBytes,
    computeIntegrationPackageDigest,
    sha256Hex,
    validateIntegrationPackageEnvelope,
} from "@bernouy/cms-integration-packages";
import type { IntegrationCandidateEnvelopeV1, ValidatedIntegrationCandidateEnvelopeV1 } from "../interfaces/candidate";
import { INTEGRATION_CANDIDATE_SCHEMA } from "../interfaces/candidate";
import { computeIntegrationVerificationDigest, validateIntegrationVerificationEnvelope } from "./verification";
import { parseVerificationJsonDocument } from "./validation/document";
import { IntegrationVerificationContractError, wrapPackageValidation } from "./validation/errors";
import { assertContractIJson, strictRecord } from "./validation/structure";

const MAX_CANDIDATE_DOCUMENT_BYTES = DEFAULT_CANONICAL_FILE_SET_LIMITS.maxDocumentBytes * 2;

export async function parseIntegrationCandidateEnvelope(
    input: string | Uint8Array,
): Promise<ValidatedIntegrationCandidateEnvelopeV1> {
    return validateIntegrationCandidateEnvelope(parseVerificationJsonDocument(input, MAX_CANDIDATE_DOCUMENT_BYTES));
}

export async function validateIntegrationCandidateEnvelope(
    value: unknown,
): Promise<ValidatedIntegrationCandidateEnvelopeV1> {
    assertContractIJson(value);
    const input = strictRecord(value, "$", ["schema", "package", "verification", "submission"]);
    if (input.schema !== INTEGRATION_CANDIDATE_SCHEMA) {
        throw new IntegrationVerificationContractError(
            "invalid_schema",
            `schema must be ${INTEGRATION_CANDIDATE_SCHEMA}`,
            "schema",
        );
    }
    const packageEnvelope = wrapPackageValidation(() =>
        validateIntegrationPackageEnvelope(input.package, { requireReleaseNotes: true }),
    );
    const verification = validateIntegrationVerificationEnvelope(input.verification);
    const submission = parseSubmission(input.submission);
    const packageDigest = await computeIntegrationPackageDigest(packageEnvelope);
    assertVerificationTarget(packageEnvelope.kind, packageEnvelope.version, packageDigest, verification.target);
    const envelope: IntegrationCandidateEnvelopeV1 = {
        schema: INTEGRATION_CANDIDATE_SCHEMA,
        package: packageEnvelope,
        verification,
        submission,
    };
    if (canonicalJsonBytes(envelope).byteLength > MAX_CANDIDATE_DOCUMENT_BYTES) {
        throw new IntegrationVerificationContractError(
            "limit_exceeded",
            `canonical candidate document exceeds ${MAX_CANDIDATE_DOCUMENT_BYTES} bytes`,
        );
    }
    return {
        envelope,
        candidateDigest: await sha256Hex(canonicalJsonBytes(envelope)),
        packageDigest,
        verificationDigest: await computeIntegrationVerificationDigest(verification),
    };
}

function parseSubmission(value: unknown): IntegrationCandidateEnvelopeV1["submission"] {
    const input = strictRecord(value, "submission", ["requestedChannel"]);
    if (input.requestedChannel !== undefined && input.requestedChannel !== "latest") {
        throw new IntegrationVerificationContractError(
            "invalid_contract",
            "submission.requestedChannel must be latest when provided",
            "submission.requestedChannel",
        );
    }
    return input.requestedChannel === "latest" ? { requestedChannel: "latest" } : {};
}

function assertVerificationTarget(
    kind: string,
    version: string,
    packageDigest: string,
    target: IntegrationCandidateEnvelopeV1["verification"]["target"],
): void {
    if (target.kind !== kind || target.version !== version || target.packageDigest !== packageDigest) {
        throw new IntegrationVerificationContractError(
            "invalid_reference",
            "verification target must match the exact candidate package identity",
            "verification.target",
        );
    }
}
