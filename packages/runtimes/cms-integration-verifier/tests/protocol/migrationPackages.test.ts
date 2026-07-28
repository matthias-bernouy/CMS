import { describe, expect, test } from "bun:test";
import { computeIntegrationPackageDigest, type IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import type { MigrationVerificationInputV1 } from "@bernouy/cms-integration-verification";
import { parseExactMigrationPackages } from "../../src";

describe("exact migration package workload", () => {
    test("accepts only the canonical source and dependency union bound to the target", async () => {
        const fixture = await migrationPackageFixture();

        const parsed = await parseExactMigrationPackages(fixture.packages, [fixture.input], fixture.input.target);

        expect(parsed).toEqual(fixture.packages);
    });

    test("rejects missing, extra, reordered, substituted, and cross-target packages", async () => {
        const fixture = await migrationPackageFixture();
        const parse = (packages: unknown, input = fixture.input, target = fixture.input.target) =>
            parseExactMigrationPackages(packages, [input], target);

        await expect(parse(fixture.packages.slice(1))).rejects.toThrow(/incomplete|extras/);
        await expect(
            parse([...fixture.packages, { digest: fixture.target.digest, envelope: fixture.target.envelope }]),
        ).rejects.toThrow(/incomplete|extras/);
        await expect(parse(fixture.packages.toReversed())).rejects.toThrow(/exact reference/);
        await expect(
            parse([
                { ...fixture.packages[0], digest: fixture.packages[1]!.digest },
                fixture.packages[1],
                fixture.packages[2],
            ]),
        ).rejects.toThrow(/exact reference/);
        await expect(
            parse(fixture.packages, fixture.input, { ...fixture.input.target, kind: "substituted" }),
        ).rejects.toThrow(/another exact package/);
    });
});

type PackageFixture = Readonly<{ envelope: IntegrationPackageEnvelopeV1; digest: string }>;

async function migrationPackageFixture() {
    const [target, source, minimum, stable] = await Promise.all([
        packageFixture("target", "2.0.0"),
        packageFixture("source", "1.0.0"),
        packageFixture("minimum", "1.0.0"),
        packageFixture("stable", "1.1.0"),
    ]);
    const reference = (value: PackageFixture) => ({
        kind: value.envelope.kind,
        version: value.envelope.version,
        packageDigest: value.digest,
    });
    const input = {
        source: reference(source),
        target: reference(target),
        dependencyMatrices: [
            { selection: "minimum", dependencies: [reference(minimum), reference(target)] },
            { selection: "stable", dependencies: [reference(minimum), reference(stable)] },
        ],
    } as MigrationVerificationInputV1;
    const packages = [source, minimum, stable]
        .toSorted((left, right) => left.digest.localeCompare(right.digest))
        .map(({ digest, envelope }) => ({ digest, envelope }));
    return { target, input, packages };
}

async function packageFixture(kind: string, version: string): Promise<PackageFixture> {
    const envelope: IntegrationPackageEnvelopeV1 = {
        schema: "cms.integration.package.v1",
        kind,
        version,
        definition: "definition.json",
        releaseNotes: "release-notes.md",
        files: {
            "definition.json": { encoding: "utf8", content: "{}" },
            "release-notes.md": { encoding: "utf8", content: `${kind} ${version}` },
        },
    };
    return { envelope, digest: await computeIntegrationPackageDigest(envelope) };
}
