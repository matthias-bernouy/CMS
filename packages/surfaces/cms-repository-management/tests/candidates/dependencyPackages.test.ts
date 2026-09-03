import { describe, expect, test } from "bun:test";
import {
    canonicalJsonBytes,
    computeIntegrationPackageDigest,
    type IntegrationPackageEnvelopeV1,
    type IntegrationPackageSource,
} from "@bernouy/cms-integration-packages";
import type { AdmissionDependencyReferenceV1 } from "@bernouy/cms-integration-verification";
import {
    resolveExactDependencyPackages,
    resolveExactUpgradePackages,
} from "../../src/operations/candidates/worker/packages";

describe("candidate exact dependency package resolution", () => {
    test("binds every minimum and stable reference even when both select the same digest", async () => {
        const exact = await packageFixture("dependency", "1.0.0");
        const references = [reference(exact, "minimum"), reference(exact, "stable")];

        const resolved = await resolveExactDependencyPackages(packageSource([exact]), references);

        expect(
            resolved.map(({ selection, kind, version, packageDigest }) => ({
                selection,
                kind,
                version,
                packageDigest,
            })),
        ).toEqual(references);
        expect(resolved[0]?.envelope).toEqual(exact.envelope);
        expect(resolved[1]?.envelope).toEqual(exact.envelope);
    });

    test("fails closed for missing, substituted, or legacy unselected references", async () => {
        const exact = await packageFixture("dependency", "1.0.0");
        const missing: IntegrationPackageSource = {
            async getPackage() {
                return null;
            },
        };
        await expect(resolveExactDependencyPackages(missing, [reference(exact, "minimum")])).rejects.toThrow(
            /dependency@1.0.0/,
        );

        const other = await packageFixture("other", "1.0.0");
        const substituted: IntegrationPackageSource = {
            async getPackage() {
                return { ...other, canonicalBytes: canonicalJsonBytes(other.envelope) };
            },
        };
        await expect(resolveExactDependencyPackages(substituted, [reference(exact, "minimum")])).rejects.toThrow(
            /unavailable/,
        );
        await expect(
            resolveExactDependencyPackages(packageSource([exact]), [
                { kind: exact.envelope.kind, version: exact.envelope.version, packageDigest: exact.digest },
            ]),
        ).rejects.toThrow(/matrix selection/);
    });
});

describe("candidate exact upgrade package resolution", () => {
    test("resolves every server-planned immutable baseline", async () => {
        const first = await packageFixture("demo", "1.0.0");
        const second = await packageFixture("demo", "1.1.0");
        const references = [first, second].map(({ envelope, digest }, index) => ({
            version: envelope.version,
            packageDigest: digest,
            resilienceKey: String(index + 1).repeat(64),
        }));

        const resolved = await resolveExactUpgradePackages(packageSource([first, second]), "demo", references);

        expect(resolved.map(({ envelope: _envelope, ...identity }) => identity)).toEqual(
            references.map(({ resilienceKey: _resilienceKey, ...reference }) => ({ kind: "demo", ...reference })),
        );
    });

    test("fails closed when an upgrade baseline is absent or substituted", async () => {
        const exact = await packageFixture("demo", "1.0.0");
        const references = [{ version: "1.0.0", packageDigest: exact.digest, resilienceKey: "1".repeat(64) }];
        await expect(resolveExactUpgradePackages(packageSource([]), "demo", references)).rejects.toThrow(/demo@1.0.0/u);
        await expect(resolveExactUpgradePackages(packageSource([exact]), "another-kind", references)).rejects.toThrow(
            /unavailable/u,
        );
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

function reference(
    value: PackageFixture,
    selection: "minimum" | "stable",
): AdmissionDependencyReferenceV1 & Readonly<{ selection: "minimum" | "stable" }> {
    return {
        selection,
        kind: value.envelope.kind,
        version: value.envelope.version,
        packageDigest: value.digest,
    };
}

function packageSource(values: readonly PackageFixture[]): IntegrationPackageSource {
    return {
        async getPackage(kind, version) {
            const value = values.find((entry) => entry.envelope.kind === kind && entry.envelope.version === version);
            return value ? { ...value, canonicalBytes: canonicalJsonBytes(value.envelope) } : null;
        },
    };
}
