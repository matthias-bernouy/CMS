import { describe, expect, test } from "bun:test";
import {
    BEHAVIORAL_RLS_AUTHOR_INPUT_SCHEMA,
    BEHAVIORAL_RLS_PLAN_SCHEMA,
    buildBehavioralRlsPlan,
    identifyBehavioralRlsPlan,
    validateBehavioralRlsPlanBinding,
    validateIntegrationVerificationEnvelope,
} from "../../../../src/exports/index";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);
const DIGEST_D = "d".repeat(64);

describe("behavioral RLS plan", () => {
    test("turns author-only fixtures into a sorted policy-owned digest binding", async () => {
        const verification = verificationWith(planInput([probe("second", "items"), probe("first", "accounts")]));
        const identified = await buildBehavioralRlsPlan({
            verification,
            target: target(),
            policyDigest: DIGEST_D,
        });

        expect(identified.plan.target).toEqual(target());
        expect(identified.plan.probes.map(({ probeId }) => probeId)).toEqual(["first", "second"]);
        await expect(
            validateBehavioralRlsPlanBinding(
                { digest: identified.digest, plan: identified.plan },
                { digest: identified.digest, plan: identified.plan },
            ),
        ).resolves.toEqual({ digest: identified.digest, plan: identified.plan });
    });

    test("represents an explicit zero exposed-table surface without author input", async () => {
        const verification = verificationWith();
        const identified = await buildBehavioralRlsPlan({
            verification,
            target: target(),
            policyDigest: DIGEST_D,
        });

        expect(identified.plan.probes).toEqual([]);
        expect(identified.plan.schema).toBe(BEHAVIORAL_RLS_PLAN_SCHEMA);
    });

    test("rejects omitted, substituted, duplicate, and identity-overwriting probes", async () => {
        const identified = await identifyBehavioralRlsPlan({
            schema: BEHAVIORAL_RLS_PLAN_SCHEMA,
            target: target(),
            policyDigest: DIGEST_D,
            probes: [],
        });
        await expect(validateBehavioralRlsPlanBinding(undefined, undefined)).resolves.toBeUndefined();
        const binding = { digest: identified.digest, plan: identified.plan };
        await expect(validateBehavioralRlsPlanBinding(undefined, binding)).rejects.toThrow(/presence exactly/);
        await expect(
            validateBehavioralRlsPlanBinding({ digest: DIGEST_A, plan: identified.plan }, binding),
        ).rejects.toThrow(/exact admission plan/);
        await expect(
            buildBehavioralRlsPlan({
                verification: verificationWith(planInput([probe("first", "accounts"), probe("second", "accounts")])),
                target: target(),
                policyDigest: DIGEST_D,
            }),
        ).rejects.toThrow(/duplicate/);
        await expect(
            buildBehavioralRlsPlan({
                verification: verificationWith(
                    planInput([
                        {
                            ...probe("first", "accounts"),
                            first: { key: "first", values: { subject_id: "forged" } },
                        },
                    ]),
                ),
                target: target(),
                policyDigest: DIGEST_D,
            }),
        ).rejects.toThrow(/generated identity column/);
    });
});

function verificationWith(input?: unknown) {
    const path = "platform/behavioral-rls.json";
    return validateIntegrationVerificationEnvelope({
        schema: "cms.integration.verification.v1",
        target: { kind: "example", version: "1.2.0", packageDigest: DIGEST_B },
        manifest: {
            runnerRequirements: [{ name: "cms-postgres", versionRange: "1.0.0" }],
            contracts: [],
            conformance: [],
            fixtures: [],
            ...(input ? { behavioralRls: path } : {}),
        },
        files: input ? { [path]: { encoding: "utf8", content: JSON.stringify(input) } } : {},
    });
}

function planInput(probes: unknown[]) {
    return { schema: BEHAVIORAL_RLS_AUTHOR_INPUT_SCHEMA, probes };
}

function target() {
    return {
        kind: "example",
        version: "1.2.0",
        candidateDigest: DIGEST_A,
        packageDigest: DIGEST_B,
        verificationDigest: DIGEST_C,
    };
}

function probe(probeId: string, relation: string) {
    return {
        probeId,
        namespace: "public",
        relation,
        keyColumn: "id",
        subjectColumn: "subject_id",
        first: { key: `${probeId}-first`, values: { label: "first" } },
        second: { key: `${probeId}-second`, values: { label: "second" } },
        firstCrossInsert: { key: `${probeId}-cross-first`, values: { label: "cross-first" } },
        secondCrossInsert: { key: `${probeId}-cross-second`, values: { label: "cross-second" } },
    };
}
