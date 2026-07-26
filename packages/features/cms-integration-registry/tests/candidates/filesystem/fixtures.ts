import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeIntegrationPackageDigest, type IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import {
    validateIntegrationCandidateEnvelope,
    type ValidatedIntegrationCandidateEnvelopeV1,
} from "@bernouy/cms-integration-verification";
import { FsIntegrationRegistryCandidateStore } from "@bernouy/cms-integration-registry/fs";

export const CANDIDATE_TIMES = Object.freeze({
    created: "2026-07-26T10:00:00.000Z",
    validating: "2026-07-26T10:01:00.000Z",
    queued: "2026-07-26T10:02:00.000Z",
    claimed: "2026-07-26T10:03:00.000Z",
    lease: "2026-07-26T10:05:00.000Z",
    completed: "2026-07-26T10:04:00.000Z",
    expiredLease: "2026-07-26T10:05:01.000Z",
    expires: "2026-07-27T10:00:00.000Z",
} as const);

export type CandidateStoreFixture = Readonly<{
    root: string;
    store: FsIntegrationRegistryCandidateStore;
    candidate: ValidatedIntegrationCandidateEnvelopeV1;
    cleanup(): void;
}>;

export type CreatedCandidateStoreFixture = CandidateStoreFixture & Readonly<{ candidateId: string; expiresAt: string }>;

export async function candidateStoreFixture(
    candidateId = "candidate-1",
    expiresAt = CANDIDATE_TIMES.expires,
): Promise<CreatedCandidateStoreFixture> {
    const root = mkdtempSync(join(tmpdir(), "cms-integration-candidates-"));
    const candidate = await candidateValue();
    return {
        root,
        candidateId,
        expiresAt,
        store: new FsIntegrationRegistryCandidateStore({ root }),
        candidate,
        cleanup: () => rmSync(root, { recursive: true, force: true }),
    };
}

export async function createCandidate(fixture: CreatedCandidateStoreFixture) {
    return await fixture.store.create({
        candidateId: fixture.candidateId,
        candidate: fixture.candidate,
        createdAt: CANDIDATE_TIMES.created,
        expiresAt: fixture.expiresAt,
    });
}

export async function queueCandidate(fixture: CreatedCandidateStoreFixture) {
    const uploaded = await createCandidate(fixture);
    const validating = await fixture.store.advance(fixture.candidateId, {
        expectedRevision: uploaded.revision,
        status: "validating",
        now: CANDIDATE_TIMES.validating,
    });
    return await fixture.store.advance(fixture.candidateId, {
        expectedRevision: validating.revision,
        status: "queued",
        now: CANDIDATE_TIMES.queued,
    });
}

export async function candidateValue(): Promise<ValidatedIntegrationCandidateEnvelopeV1> {
    const packageEnvelope: IntegrationPackageEnvelopeV1 = {
        schema: "cms.integration.package.v1",
        kind: "example",
        version: "1.2.0",
        definition: "definition.json",
        releaseNotes: "release-notes.md",
        files: {
            "definition.json": { encoding: "utf8", content: "{}" },
            "release-notes.md": { encoding: "utf8", content: "Release" },
        },
    };
    const packageDigest = await computeIntegrationPackageDigest(packageEnvelope);
    return await validateIntegrationCandidateEnvelope({
        schema: "cms.integration.candidate.v1",
        package: packageEnvelope,
        verification: {
            schema: "cms.integration.verification.v1",
            target: { kind: "example", version: "1.2.0", packageDigest },
            manifest: {
                runnerRequirements: [{ name: "cms-postgres", versionRange: "^1.0.0" }],
                contracts: [],
                conformance: [],
                fixtures: [],
            },
            files: {},
        },
        submission: { requestedChannel: "latest" },
    });
}
