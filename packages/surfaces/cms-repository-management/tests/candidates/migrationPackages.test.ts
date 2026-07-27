import { describe, expect, test } from "bun:test";
import {
    canonicalJsonBytes,
    computeIntegrationPackageDigest,
    type IntegrationPackageEnvelopeV1,
    type IntegrationPackageSource,
} from "@bernouy/cms-integration-packages";
import type { MigrationVerificationInputV1 } from "@bernouy/cms-integration-verification";
import { resolveExactMigrationPackages } from "../../src/operations/candidates/worker/packages";

describe("candidate exact migration package resolution", () => {
    test("resolves the canonical union of sources and dependency matrices without duplicating the target", async () => {
        const packages = await packageFixtures();
        const input = migrationInput(packages);

        const resolved = await resolveExactMigrationPackages(packageSource(packages), [input], input.target);

        expect(resolved.map(({ digest }) => digest)).toEqual(
            [packages.source, packages.minimum, packages.stable]
                .map(({ digest }) => digest)
                .toSorted((left, right) => left.localeCompare(right)),
        );
        expect(resolved.map(({ envelope }) => `${envelope.kind}@${envelope.version}`).toSorted()).toEqual([
            "minimum@1.0.0",
            "source@1.0.0",
            "stable@1.1.0",
        ]);
    });

    test("fails closed when a referenced package is absent or substituted", async () => {
        const packages = await packageFixtures();
        const input = migrationInput(packages);
        const missing = packageSource(packages, packages.source.envelope.kind);
        await expect(resolveExactMigrationPackages(missing, [input], input.target)).rejects.toThrow(/source@1.0.0/);

        const substituted: IntegrationPackageSource = {
            async getPackage(kind, version) {
                const exact = await packageSource(packages).getPackage(kind, version);
                return exact ? { ...exact, digest: packages.target.digest } : null;
            },
        };
        await expect(resolveExactMigrationPackages(substituted, [input], input.target)).rejects.toThrow(/unavailable/);
    });
});

type PackageFixture = Readonly<{
    envelope: IntegrationPackageEnvelopeV1;
    digest: string;
}>;

async function packageFixtures() {
    const [target, source, minimum, stable] = await Promise.all([
        packageFixture("target", "2.0.0"),
        packageFixture("source", "1.0.0"),
        packageFixture("minimum", "1.0.0"),
        packageFixture("stable", "1.1.0"),
    ]);
    return { target, source, minimum, stable };
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

function packageSource(
    packages: Awaited<ReturnType<typeof packageFixtures>>,
    missingKind?: string,
): IntegrationPackageSource {
    const values = [packages.target, packages.source, packages.minimum, packages.stable];
    return {
        async getPackage(kind, version) {
            if (kind === missingKind) {
                return null;
            }
            const value = values.find((entry) => entry.envelope.kind === kind && entry.envelope.version === version);
            return value ? { ...value, canonicalBytes: canonicalJsonBytes(value.envelope) } : null;
        },
    };
}

function migrationInput(packages: Awaited<ReturnType<typeof packageFixtures>>): MigrationVerificationInputV1 {
    const reference = (value: PackageFixture) => ({
        kind: value.envelope.kind,
        version: value.envelope.version,
        packageDigest: value.digest,
    });
    return {
        source: reference(packages.source),
        target: reference(packages.target),
        dependencyMatrices: [
            { selection: "minimum", dependencies: [reference(packages.minimum), reference(packages.target)] },
            { selection: "stable", dependencies: [reference(packages.minimum), reference(packages.stable)] },
        ],
    } as MigrationVerificationInputV1;
}
