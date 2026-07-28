import { readCanonicalJsonFile, writeCanonicalJsonNoReplace } from "../../../persistence/canonicalFile";
import type { IntegrationRegistryCandidateRecord } from "cms-integration-registry/interfaces/publication";

export const PRUNED_INTEGRATION_REGISTRY_CANDIDATE_SCHEMA = "cms.integration.registry.pruned-candidate.v1" as const;
export const PRUNED_INTEGRATION_REGISTRY_CANDIDATE_DOCUMENT_LIMIT = 8 * 1_024;

export type PrunedIntegrationRegistryCandidateRecord = Readonly<{
    schema: typeof PRUNED_INTEGRATION_REGISTRY_CANDIDATE_SCHEMA;
    candidateId: string;
    kind: string;
    version: string;
    candidateDigest: string;
    packageDigest: string;
    verificationDigest: string;
    policyDigest?: string;
    admissionInputDigest?: string;
    admissionJobResultDigest?: string;
    finalStatus: "published" | "rejected" | "expired";
    finalRevision: number;
    prunedAt: string;
}>;

export async function writeOrVerifyPrunedCandidate(
    path: string,
    record: IntegrationRegistryCandidateRecord,
    prunedAt: string,
): Promise<PrunedIntegrationRegistryCandidateRecord> {
    const value: PrunedIntegrationRegistryCandidateRecord = {
        schema: PRUNED_INTEGRATION_REGISTRY_CANDIDATE_SCHEMA,
        candidateId: record.candidateId,
        kind: record.kind,
        version: record.version,
        candidateDigest: record.candidateDigest,
        packageDigest: record.packageDigest,
        verificationDigest: record.verificationDigest,
        ...(record.policyDigest ? { policyDigest: record.policyDigest } : {}),
        ...(record.admissionInputDigest ? { admissionInputDigest: record.admissionInputDigest } : {}),
        ...(record.admissionJobResultDigest ? { admissionJobResultDigest: record.admissionJobResultDigest } : {}),
        finalStatus: record.status as PrunedIntegrationRegistryCandidateRecord["finalStatus"],
        finalRevision: record.revision,
        prunedAt,
    };
    try {
        await writeCanonicalJsonNoReplace(path, value, PRUNED_INTEGRATION_REGISTRY_CANDIDATE_DOCUMENT_LIMIT);
        return value;
    } catch (error) {
        if (!isNodeError(error) || error.code !== "EEXIST") {
            throw error;
        }
        const existing = await readPrunedCandidate(path);
        if (
            !existing ||
            existing.candidateId !== value.candidateId ||
            existing.kind !== value.kind ||
            existing.version !== value.version ||
            existing.candidateDigest !== value.candidateDigest ||
            existing.packageDigest !== value.packageDigest ||
            existing.verificationDigest !== value.verificationDigest ||
            existing.policyDigest !== value.policyDigest ||
            existing.admissionInputDigest !== value.admissionInputDigest ||
            existing.admissionJobResultDigest !== value.admissionJobResultDigest ||
            existing.finalRevision !== value.finalRevision ||
            existing.finalStatus !== value.finalStatus
        ) {
            throw new Error(`Pruned candidate audit conflicts with ${record.candidateId}`);
        }
        return existing;
    }
}

export async function readPrunedCandidate(path: string): Promise<PrunedIntegrationRegistryCandidateRecord | null> {
    const value = await readCanonicalJsonFile(path, PRUNED_INTEGRATION_REGISTRY_CANDIDATE_DOCUMENT_LIMIT);
    if (value === null) {
        return null;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Pruned candidate audit must be an object");
    }
    const input = value as Record<string, unknown>;
    const fields = [
        "schema",
        "candidateId",
        "kind",
        "version",
        "candidateDigest",
        "packageDigest",
        "verificationDigest",
        "policyDigest",
        "admissionInputDigest",
        "admissionJobResultDigest",
        "finalStatus",
        "finalRevision",
        "prunedAt",
    ];
    if (Object.keys(input).some((field) => !fields.includes(field))) {
        throw new Error("Pruned candidate audit contains an unknown field");
    }
    if (
        input.schema !== PRUNED_INTEGRATION_REGISTRY_CANDIDATE_SCHEMA ||
        typeof input.candidateId !== "string" ||
        typeof input.kind !== "string" ||
        typeof input.version !== "string" ||
        !isDigest(input.candidateDigest) ||
        !isDigest(input.packageDigest) ||
        !isDigest(input.verificationDigest) ||
        (input.policyDigest !== undefined && !isDigest(input.policyDigest)) ||
        (input.admissionInputDigest !== undefined && !isDigest(input.admissionInputDigest)) ||
        (input.admissionJobResultDigest !== undefined && !isDigest(input.admissionJobResultDigest)) ||
        (input.policyDigest === undefined) !== (input.admissionInputDigest === undefined) ||
        !new Set(["published", "rejected", "expired"]).has(String(input.finalStatus)) ||
        !Number.isSafeInteger(input.finalRevision) ||
        Number(input.finalRevision) < 0 ||
        !isTimestamp(input.prunedAt)
    ) {
        throw new Error("Pruned candidate audit is invalid");
    }
    return value as PrunedIntegrationRegistryCandidateRecord;
}

function isDigest(value: unknown): value is string {
    return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function isTimestamp(value: unknown): value is string {
    return (
        typeof value === "string" &&
        Number.isFinite(Date.parse(value)) &&
        new Date(Date.parse(value)).toISOString() === value
    );
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
