import { describe, expect, test } from "bun:test";
import {
    createCompatibilityFinding,
    findingResolutionProofAppliesToPolicy,
    parseCompatibilityFinding,
    parseFindingResolutionProof,
} from "../../src/exports/index";
import { CREATED_AT, DIGEST_A, DIGEST_B, DIGEST_C } from "./fixtures";

function finding(message: string, candidateDigest = DIGEST_A) {
    return createCompatibilityFinding({
        surface: "schema",
        path: "connectors.primary.public.orders",
        code: "legacy-schema-baseline-missing",
        baselineDigest: DIGEST_B,
        candidateDigest,
        classification: "unknown",
        message,
    });
}

describe("compatibility finding identities and scoped proofs", () => {
    test("excludes the human message from the canonical finding identity", async () => {
        const before = await finding("Baseline is unavailable");
        const reworded = await finding("No reviewed baseline was found");

        expect(reworded.findingId).toBe(before.findingId);
        await expect(parseCompatibilityFinding(reworded)).resolves.toEqual(reworded);
    });

    test("changes identity when either package digest changes", async () => {
        const before = await finding("Missing");
        const changed = await finding("Missing", DIGEST_C);

        expect(changed.findingId).not.toBe(before.findingId);
        await expect(parseCompatibilityFinding({ ...before, candidateDigest: DIGEST_C })).rejects.toThrow(
            /does not match its canonical identity/,
        );
    });

    test("scopes proof applicability to the named supported policy range", async () => {
        const target = await finding("Missing");
        const proof = parseFindingResolutionProof({
            schema: "cms.integration.finding-resolution-proof.v1",
            findingId: target.findingId,
            outcome: "resolved-compatible",
            proofType: "observed-schema",
            producer: "cms-postgres",
            policy: { name: "compatibility", version: "1.2.0", applicableVersionRange: "^1.2.0" },
            runnerDigest: DIGEST_B,
            evidenceDigest: DIGEST_C,
            createdAt: CREATED_AT,
        });

        expect(findingResolutionProofAppliesToPolicy(proof, { name: "compatibility", version: "1.9.0" })).toBeTrue();
        expect(findingResolutionProofAppliesToPolicy(proof, { name: "compatibility", version: "2.0.0" })).toBeFalse();
        expect(findingResolutionProofAppliesToPolicy(proof, { name: "other", version: "1.9.0" })).toBeFalse();
    });

    test("fails closed when a proof version is outside its own applicability range", async () => {
        const target = await finding("Missing");
        expect(() =>
            parseFindingResolutionProof({
                schema: "cms.integration.finding-resolution-proof.v1",
                findingId: target.findingId,
                outcome: "resolved-compatible",
                proofType: "observed-schema",
                producer: "cms-postgres",
                policy: { name: "compatibility", version: "2.0.0", applicableVersionRange: "^1.2.0" },
                evidenceDigest: DIGEST_C,
                createdAt: CREATED_AT,
            }),
        ).toThrow(/does not include version 2.0.0/);
    });
});
