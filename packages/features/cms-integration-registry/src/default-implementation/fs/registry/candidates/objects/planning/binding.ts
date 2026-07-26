import { isDeepStrictEqual } from "node:util";
import { readCanonicalJsonFile, writeCanonicalJsonNoReplace } from "../../../persistence/canonicalFile";
import { readVerifiedRegistryDirectory } from "../../../persistence/ownedDirectory";
import {
    assertCandidateId,
    assertCandidateRevision,
    assertSha256Digest,
    candidatePlanningBindingPath,
    FS_INTEGRATION_REGISTRY_CANDIDATE_DOCUMENT_LIMIT,
    type FsIntegrationRegistryCandidateLayout,
} from "../../layout";
import { corrupt } from "../shared";

export const CANDIDATE_PLAN_BINDING_SCHEMA = "cms.integration.registry.candidate-plan-binding.v1" as const;

export type CandidatePlanBinding = Readonly<{
    schema: typeof CANDIDATE_PLAN_BINDING_SCHEMA;
    candidateId: string;
    expectedRevision: number;
    candidateDigest: string;
    compatibilityReportDigest: string;
    compatibilityEvaluatorInputDigest: string;
    statefulChangeSelectionDigest: string;
}>;

export async function writeOrVerifyCandidatePlanBinding(
    layout: FsIntegrationRegistryCandidateLayout,
    binding: CandidatePlanBinding,
): Promise<CandidatePlanBinding> {
    try {
        await writeCanonicalJsonNoReplace(
            candidatePlanningBindingPath(layout, binding.candidateId),
            binding,
            FS_INTEGRATION_REGISTRY_CANDIDATE_DOCUMENT_LIMIT,
        );
    } catch (error) {
        if (!isNodeError(error) || error.code !== "EEXIST") {
            throw error;
        }
        const existing = await readCandidatePlanBinding(layout, binding.candidateId);
        if (!existing || !isDeepStrictEqual(existing, binding)) {
            corrupt(`Candidate ${binding.candidateId} already has a different immutable admission plan`);
        }
    }
    await readVerifiedRegistryDirectory(layout.plans);
    return binding;
}

export async function readCandidatePlanBinding(
    layout: FsIntegrationRegistryCandidateLayout,
    candidateId: string,
): Promise<CandidatePlanBinding | null> {
    assertCandidateId(candidateId);
    await readVerifiedRegistryDirectory(layout.plans);
    const value = await readCanonicalJsonFile(
        candidatePlanningBindingPath(layout, candidateId),
        FS_INTEGRATION_REGISTRY_CANDIDATE_DOCUMENT_LIMIT,
    );
    return value === null ? null : parseBinding(value, candidateId);
}

function parseBinding(value: unknown, candidateId: string): CandidatePlanBinding {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        corrupt(`Candidate ${candidateId} plan binding must be an object`);
    }
    const input = value as Record<string, unknown>;
    const fields = [
        "schema",
        "candidateId",
        "expectedRevision",
        "candidateDigest",
        "compatibilityReportDigest",
        "compatibilityEvaluatorInputDigest",
        "statefulChangeSelectionDigest",
    ];
    if (Object.keys(input).some((field) => !fields.includes(field))) {
        corrupt(`Candidate ${candidateId} plan binding contains an unknown field`);
    }
    if (input.schema !== CANDIDATE_PLAN_BINDING_SCHEMA || input.candidateId !== candidateId) {
        corrupt(`Candidate ${candidateId} plan binding identity is invalid`);
    }
    if (!Number.isSafeInteger(input.expectedRevision)) {
        corrupt(`Candidate ${candidateId} plan binding revision is invalid`);
    }
    assertCandidateRevision(input.expectedRevision as number);
    for (const field of [
        "candidateDigest",
        "compatibilityReportDigest",
        "compatibilityEvaluatorInputDigest",
        "statefulChangeSelectionDigest",
    ] as const) {
        assertSha256Digest(String(input[field]));
    }
    return input as CandidatePlanBinding;
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
