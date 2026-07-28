import { describe, expect, test } from "bun:test";
import {
    advanceIntegrationRegistryCandidate,
    createIntegrationRegistryCandidateRecord,
    IntegrationRegistryCandidateError,
    queueIntegrationRegistryCandidate,
} from "@bernouy/cms-integration-registry";
import { candidateAdmission, candidatePolicy, candidateValue } from "../filesystem/fixtures";
import { candidateIdentity, TIMES } from "./fixture";

describe("integration registry candidate validation and admission plan", () => {
    test("fails closed on malformed identities and direct queueing", async () => {
        const candidate = await candidateValue();
        expect(() =>
            createIntegrationRegistryCandidateRecord({
                candidateId: "../escape",
                candidate,
                createdAt: TIMES.created,
                expiresAt: TIMES.expires,
            }),
        ).toThrow(IntegrationRegistryCandidateError);
        expect(() =>
            createIntegrationRegistryCandidateRecord({
                candidateId: "candidate-1",
                submittedBy: "invalid-\ud800-actor",
                candidate,
                createdAt: TIMES.created,
                expiresAt: TIMES.expires,
            }),
        ).toThrow(IntegrationRegistryCandidateError);
        const identity = await candidateIdentity();
        expect(() =>
            advanceIntegrationRegistryCandidate(identity.record, {
                expectedRevision: identity.record.revision,
                status: "queued" as "validating",
                now: TIMES.queued,
            }),
        ).toThrow();
    });

    test("rejects an admission snapshot for another exact candidate identity", async () => {
        const identity = await candidateIdentity();
        const validating = advanceIntegrationRegistryCandidate(identity.record, {
            expectedRevision: 0,
            status: "validating",
            now: TIMES.validating,
        });
        const admission = await candidateAdmission(identity);
        await expect(
            queueIntegrationRegistryCandidate(validating, {
                expectedRevision: validating.revision,
                now: TIMES.queued,
                policy: await candidatePolicy(),
                admission: { ...admission, candidate: { ...admission.candidate, candidateId: "other" } },
            }),
        ).rejects.toThrow(/exact candidate identity/);
    });
});
