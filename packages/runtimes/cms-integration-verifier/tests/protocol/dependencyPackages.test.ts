import { describe, expect, test } from "bun:test";
import { computeIntegrationPackageDigest, type IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import type { AdmissionDependencyReferenceV1 } from "@bernouy/cms-integration-verification";
import { parseExactDependencyPackages } from "../../src";

describe("exact dependency package workload", () => {
    test("accepts every selected admission reference including one digest selected twice", async () => {
        const exact = await packageFixture("dependency", "1.0.0");
        const references = [reference(exact, "minimum"), reference(exact, "stable")];
        const packages = references.map((entry) => ({ ...entry, envelope: exact.envelope }));

        expect(await parseExactDependencyPackages(packages, references)).toEqual(packages);
    });

    test("rejects missing, extra, reordered, tampered, and substituted packages", async () => {
        const minimum = await packageFixture("dependency", "1.0.0");
        const stable = await packageFixture("dependency", "1.1.0");
        const references = [reference(minimum, "minimum"), reference(stable, "stable")];
        const packages = [
            { ...references[0]!, envelope: minimum.envelope },
            { ...references[1]!, envelope: stable.envelope },
        ];
        const parse = (value: unknown) => parseExactDependencyPackages(value, references);

        await expect(parse(packages.slice(1))).rejects.toThrow(/incomplete|extras/);
        await expect(parse([...packages, packages[0]])).rejects.toThrow(/incomplete|extras/);
        await expect(parse(packages.toReversed())).rejects.toThrow(/substituted/);
        await expect(parse([{ ...packages[0], packageDigest: stable.digest }, packages[1]])).rejects.toThrow(
            /substituted/,
        );
        await expect(
            parse([
                {
                    ...packages[0],
                    envelope: {
                        ...minimum.envelope,
                        files: {
                            ...minimum.envelope.files,
                            "release-notes.md": { encoding: "utf8", content: "tampered" },
                        },
                    },
                },
                packages[1],
            ]),
        ).rejects.toThrow(/substituted/);
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
