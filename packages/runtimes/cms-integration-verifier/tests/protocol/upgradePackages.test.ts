import { describe, expect, test } from "bun:test";
import { computeIntegrationPackageDigest, type IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import type { ReleaseVerificationPlanBaselineV1 } from "@bernouy/cms-integration-verification";
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
        }));
        const parse = (value: unknown, kind = "demo") => parseExactUpgradePackages(value, kind, references);

        await expect(parse(packages.slice(1))).rejects.toThrow(/incomplete|extras/u);
        await expect(parse(packages.toReversed())).rejects.toThrow(/substituted/u);
        await expect(parse([{ ...packages[0], packageDigest: second.digest }, packages[1]])).rejects.toThrow(
            /substituted/u,
        );
        await expect(parse(packages, "another-kind")).rejects.toThrow(/substituted/u);
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
