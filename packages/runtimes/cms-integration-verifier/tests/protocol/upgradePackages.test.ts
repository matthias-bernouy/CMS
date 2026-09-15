import { describe, expect, test } from "bun:test";
import { computeIntegrationPackageDigest, type IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import { identifyObservedSchemaContract } from "@bernouy/cms-integrations";
import {
    identifyReviewedSchemaBaseline,
    type ReleaseVerificationPlanBaselineV1,
} from "@bernouy/cms-integration-verification";
import { parseExactUpgradePackages } from "../../src";

describe("exact upgrade package workload", () => {
    test("accepts every baseline in the server-owned release plan", async () => {
        const first = await packageFixture("demo", "1.0.0");
        const second = await packageFixture("demo", "1.1.0");
        const references = [reference(first, "1"), reference(second, "2")];
        const packages = references.map((entry, index) => ({
            kind: "demo",
            version: entry.version,
            packageDigest: entry.packageDigest,
            envelope: [first, second][index]!.envelope,
            reviewedSchemaBaselines: [],
        }));

        expect(await parseExactUpgradePackages(packages, "demo", references)).toEqual(packages);
    });

    test("rejects missing, reordered, tampered, and cross-kind baselines", async () => {
        const first = await packageFixture("demo", "1.0.0");
        const second = await packageFixture("demo", "1.1.0");
        const references = [reference(first, "1"), reference(second, "2")];
        const packages = [first, second].map(({ envelope, digest }) => ({
            kind: "demo",
            version: envelope.version,
            packageDigest: digest,
            envelope,
            reviewedSchemaBaselines: [],
        }));
        const parse = (value: unknown, kind = "demo") => parseExactUpgradePackages(value, kind, references);

        await expect(parse(packages.slice(1))).rejects.toThrow(/incomplete|extras/u);
        await expect(parse(packages.toReversed())).rejects.toThrow(/substituted/u);
        await expect(parse([{ ...packages[0], packageDigest: second.digest }, packages[1]])).rejects.toThrow(
            /substituted/u,
        );
        await expect(parse(packages, "another-kind")).rejects.toThrow(/substituted/u);
    });

    test("carries only reviewed schema baselines bound by the admission snapshot", async () => {
        const exact = await packageFixture("demo", "1.0.0");
        const reviewed = await reviewedBaseline(exact);
        const identified = await identifyReviewedSchemaBaseline(reviewed);
        const reviewedReference = {
            kind: reviewed.kind,
            version: reviewed.version,
            packageDigest: reviewed.packageDigest,
            connectorKey: reviewed.connectorKey,
            lineageId: reviewed.lineageId,
            revisionId: reviewed.reportId,
            baselineDigest: identified.digest,
            observedSchemaDigest: reviewed.observedSchemaDigest,
        };
        const entry = {
            kind: "demo",
            version: "1.0.0",
            packageDigest: exact.digest,
            envelope: exact.envelope,
            reviewedSchemaBaselines: [reviewed],
        };

        expect(await parseExactUpgradePackages([entry], "demo", [reference(exact, "1")], [reviewedReference])).toEqual([
            entry,
        ]);
        await expect(parseExactUpgradePackages([entry], "demo", [reference(exact, "1")], [])).rejects.toThrow(
            /extras/u,
        );
        await expect(
            parseExactUpgradePackages(
                [{ ...entry, reviewedSchemaBaselines: [] }],
                "demo",
                [reference(exact, "1")],
                [reviewedReference],
            ),
        ).rejects.toThrow(/incomplete/u);
    });
});

type PackageFixture = Readonly<{ envelope: IntegrationPackageEnvelopeV1; digest: string }>;

async function packageFixture(kind: string, version: string): Promise<PackageFixture> {
    const envelope: IntegrationPackageEnvelopeV1 = {
        schema: "cms.integration.package.v1",
        kind,
        version,
        definition: "definition.json",
        releaseNotes: "release-notes.md",
        files: {
            "definition.json": { encoding: "utf8", content: JSON.stringify({ kind, version }) },
            "release-notes.md": { encoding: "utf8", content: `${kind} ${version}` },
        },
    };
    return { envelope, digest: await computeIntegrationPackageDigest(envelope) };
}

function reference(value: PackageFixture, key: string): ReleaseVerificationPlanBaselineV1 {
    return {
        version: value.envelope.version,
        packageDigest: value.digest,
        resilienceKey: key.repeat(64),
    };
}

async function reviewedBaseline(value: PackageFixture) {
    const observedSchema = {
        schema: "cms.integration.observed-schema.v1" as const,
        owner: { connectorKey: "primary", lineageId: "demo-supabase-v1" },
        namespaces: [{ name: "public", relations: [] }],
    };
    return {
        schema: "cms.integration.reviewed-schema-baseline.v1" as const,
        reportId: "baseline-1",
        revisionType: "root" as const,
        origin: "legacy-backfill" as const,
        createdAt: "2026-09-15T12:00:00.000Z",
        kind: value.envelope.kind,
        version: value.envelope.version,
        packageDigest: value.digest,
        connectorKey: "primary",
        lineageId: "demo-supabase-v1",
        legacySelector: { provider: "supabase", root: "connectors/supabase" },
        dependencies: [],
        observedSchema,
        observedSchemaDigest: (await identifyObservedSchemaContract(observedSchema)).digest,
        generator: { name: "cms-postgres", version: "1.0.0", imageDigest: `sha256:${"a".repeat(64)}` },
        environment: { digest: "b".repeat(64), postgresVersion: "16.4" },
        policy: { name: "legacy-schema-baseline", version: "1.0.0" },
        generatedAt: "2026-09-15T12:00:00.000Z",
        provenance: { actor: "release-test", reason: "Test baseline", evidenceIds: ["observed-schema-test"] },
    };
}
