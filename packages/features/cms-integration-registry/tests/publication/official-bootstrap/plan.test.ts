import { describe, expect, test } from "bun:test";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { bootstrapPlan, identifyOfficialRepositoryBootstrapPlan, legacySqlPackage, reviewedBaseline } from "./fixtures";

describe("official bootstrap plan identity", () => {
    test("canonically identifies equivalent package order without serializing Uint8Array fields", async () => {
        const alpha = await legacySqlPackage("alpha");
        const beta = await legacySqlPackage("beta");
        const alphaBaseline = await reviewedBaseline(alpha);
        const betaBaseline = await reviewedBaseline(beta);

        const left = await identifyOfficialRepositoryBootstrapPlan(
            bootstrapPlan([beta, alpha], [betaBaseline, alphaBaseline]),
        );
        const right = await identifyOfficialRepositoryBootstrapPlan(
            bootstrapPlan([alpha, beta], [alphaBaseline, betaBaseline]),
        );

        expect(left.digest).toBe(right.digest);
        expect(left.canonicalBytes).toEqual(right.canonicalBytes);
        expect("canonicalBytes" in left.plan.packages[0]!.package).toBeFalse();
        expect(JSON.parse(new TextDecoder().decode(left.canonicalBytes))).toEqual(left.plan);
    });

    test("changes identity with evidence and rejects package byte or digest tampering", async () => {
        const integrationPackage = await legacySqlPackage("legacy");
        const baseline = await reviewedBaseline(integrationPackage);
        const changed = await reviewedBaseline(integrationPackage, { reason: "A distinct reviewed reason." });
        const original = await identifyOfficialRepositoryBootstrapPlan(bootstrapPlan([integrationPackage], [baseline]));
        const changedIdentity = await identifyOfficialRepositoryBootstrapPlan(
            bootstrapPlan([integrationPackage], [changed]),
        );

        expect(changedIdentity.digest).not.toBe(original.digest);
        await expect(
            identifyOfficialRepositoryBootstrapPlan(
                bootstrapPlan([{ ...integrationPackage, digest: "f".repeat(64) }], [baseline]),
            ),
        ).rejects.toThrow(/digest/i);
        const modifiedEnvelope = {
            ...integrationPackage.envelope,
            files: {
                ...integrationPackage.envelope.files,
                "README.md": { encoding: "utf8" as const, content: "tampered\n" },
            },
        };
        await expect(
            identifyOfficialRepositoryBootstrapPlan(
                bootstrapPlan([{ ...integrationPackage, envelope: modifiedEnvelope }], [baseline]),
            ),
        ).rejects.toThrow(/canonical/i);
        expect(canonicalJsonBytes(original.plan)).toEqual(original.canonicalBytes);
    });
});
