import { describe, expect, test } from "bun:test";
import {
    createCompatibilityFinding,
    resolveCompatibilityFindings,
    type FindingResolutionProof,
} from "../../src/exports/index";
import { CREATED_AT, DIGEST_A, DIGEST_B, DIGEST_C } from "./fixtures";

const POLICY = { name: "static-compatibility", version: "1.3.0" } as const;
const RUNNER = "d".repeat(64);

describe("scoped compatibility finding resolution", () => {
    test("resolves only an exact unknown finding through an allowlisted proof", async () => {
        const finding = await unknownFinding();
        const proof = resolutionProof(finding.findingId);
        const result = await resolveCompatibilityFindings({
            findings: [finding],
            proofs: [proof],
            policy: POLICY,
            rules: [rule()],
        });

        expect(result.contractAdmissible).toBeTrue();
        expect(result.findings[0]).toMatchObject({
            finding: { findingId: finding.findingId, classification: "unknown" },
            effectiveClassification: "compatible",
            proof: { evidenceDigest: DIGEST_C },
        });
    });

    test("fails closed for stale digest identities, policies, runners, producers, and proof types", async () => {
        const finding = await unknownFinding();
        const attempts = [
            { proof: resolutionProof(DIGEST_A), rules: [rule()], error: /absent finding/ },
            {
                proof: {
                    ...resolutionProof(finding.findingId),
                    policy: {
                        ...resolutionProof(finding.findingId).policy,
                        applicableVersionRange: "^2.0.0",
                        version: "2.0.0",
                    },
                },
                rules: [rule()],
                error: /not applicable/,
            },
            {
                proof: { ...resolutionProof(finding.findingId), runnerDigest: DIGEST_A },
                rules: [rule()],
                error: /runner/,
            },
            {
                proof: { ...resolutionProof(finding.findingId), producer: "author" },
                rules: [rule()],
                error: /producer/,
            },
            {
                proof: { ...resolutionProof(finding.findingId), proofType: "generic-pass" },
                rules: [rule()],
                error: /type/,
            },
            { proof: resolutionProof(finding.findingId), rules: [], error: /not externally resolvable/ },
        ];
        for (const attempt of attempts) {
            await expect(
                resolveCompatibilityFindings({
                    findings: [finding],
                    proofs: [attempt.proof],
                    policy: POLICY,
                    rules: attempt.rules,
                }),
            ).rejects.toThrow(attempt.error);
        }
    });

    test("never permits positive evidence to erase known breaking or invalid findings", async () => {
        const unknown = await unknownFinding();
        for (const classification of ["breaking", "invalid"] as const) {
            await expect(
                resolveCompatibilityFindings({
                    findings: [{ ...unknown, classification }],
                    proofs: [resolutionProof(unknown.findingId)],
                    policy: POLICY,
                    rules: [rule()],
                }),
            ).rejects.toThrow(/Only unknown findings/);
        }
    });

    test("keeps unresolved unknowns inadmissible and records confirmed breaking or invalid outcomes", async () => {
        const finding = await unknownFinding();
        const unresolved = await resolveCompatibilityFindings({
            findings: [finding],
            proofs: [],
            policy: POLICY,
            rules: [rule()],
        });
        expect(unresolved).toMatchObject({ contractAdmissible: false });

        for (const [outcome, effectiveClassification] of [
            ["confirmed-breaking", "breaking"],
            ["invalid", "invalid"],
        ] as const) {
            const result = await resolveCompatibilityFindings({
                findings: [finding],
                proofs: [{ ...resolutionProof(finding.findingId), outcome }],
                policy: POLICY,
                rules: [rule()],
            });
            expect(result.findings[0]?.effectiveClassification).toBe(effectiveClassification);
            expect(result.contractAdmissible).toBeFalse();
        }
    });
});

async function unknownFinding() {
    return createCompatibilityFinding({
        surface: "schema",
        path: "public.orders.constraint.orders_state_check",
        code: "check-semantics-unproven",
        baselineDigest: DIGEST_B,
        candidateDigest: DIGEST_A,
        classification: "unknown",
        message: "CHECK semantics could not be proven",
    });
}

function resolutionProof(findingId: string): FindingResolutionProof {
    return {
        schema: "cms.integration.finding-resolution-proof.v1",
        findingId,
        outcome: "resolved-compatible",
        proofType: "postgres-semantic-equivalence",
        producer: "schema-verifier",
        policy: { name: POLICY.name, version: "1.2.0", applicableVersionRange: "^1.2.0" },
        runnerDigest: RUNNER,
        evidenceDigest: DIGEST_C,
        createdAt: CREATED_AT,
    };
}

function rule() {
    return {
        surface: "schema",
        code: "check-semantics-unproven",
        proofTypes: ["postgres-semantic-equivalence"],
        producers: ["schema-verifier"],
        runnerDigests: [RUNNER],
    } as const;
}
