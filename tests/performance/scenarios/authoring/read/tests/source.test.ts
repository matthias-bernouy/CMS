import { beforeAll, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { compileOfficialFeatures } from "@bernouy/ulvia-provider/build";
import { InMemoryReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";
import { compileCollectionSources, prepareContractSource } from "@bernouy/repository/repository/authoring/build";
import { admitProviderManifestJson } from "@bernouy/ulvia-providers";
import { sourceReadFixture, sourceReadInput } from "../sources/source";
import { sourceReadOracle } from "../sources/oracle";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import type { ContractParentReference } from "@bernouy/ulvia-contracts";

let implementation: ContractParentReference;
const catalogue = new InMemoryReleaseCatalogue();
beforeAll(async () => {
    const build = await compileOfficialFeatures();
    implementation = build.implementations.find((row) => row.contractId === "ulvia/cms.content")!;
    for (const admitted of build.contracts) {
        await catalogue.publish(admitted);
    }
});

test("all three authored kinds really admit bounded large sources, including expanded snapshots beyond the named 1 MiB promise", async () => {
    for (const kind of ["collection", "contract", "provider-manifest"] as const) {
        for (const large of [true, "expanded"] as const) {
            const source = sourceReadFixture(kind, "performance-source-unit", implementation, 7, large);
            expect(source.files.every((file) => Buffer.byteLength(file.content) <= 1024 * 1024)).toBe(true);
            expect(source.sourceJson.length > 1024 * 1024).toBe(large === "expanded" && kind !== "provider-manifest");
            expect(Buffer.byteLength(source.sourceJson)).toBeGreaterThan(256 * 1024);
            const directory = await mkdtemp(join(tmpdir(), "ulvia-source-reader-unit-"));
            try {
                let digest: string;
                let retained = JSON.stringify({ files: source.files, assets: [] });
                if (kind === "collection") {
                    const result = await compileCollectionSources(directory, source.sourceJson, []);
                    digest = result.admission.digest;
                    retained = result.sourceJson;
                } else {
                    for (const file of source.files) {
                        const path = join(directory, file.path);
                        await mkdir(dirname(path), { recursive: true });
                        await writeFile(path, file.content);
                    }
                    digest =
                        kind === "contract"
                            ? (await prepareContractSource(directory)).admission.digest
                            : (await admitProviderManifestJson(source.files[0]!.content, catalogue)).digest;
                }
                const assert = sourceReadOracle({ source, digest, publication: {} });
                expect(() => assert({ releaseDigest: digest, sourceJson: retained })).not.toThrow();
                const truncated = JSON.parse(retained);
                truncated.files[0].content = truncated.files[0].content.slice(1);
                expect(() => assert({ releaseDigest: digest, sourceJson: JSON.stringify(truncated) })).toThrow();
            } finally {
                await rm(directory, { recursive: true, force: true });
            }
        }
    }
}, 30_000);

test("source oracles reject missing, duplicate, foreign-pin and extra private output while keeping exact authored whitespace", () => {
    const source = sourceReadFixture("contract", "performance-source-unit", implementation, 1, false);
    const digest = `sha256:${"a".repeat(64)}`;
    const assert = sourceReadOracle({ source, digest, publication: {} });
    const retained = { files: source.files, assets: [] };
    const output = { releaseDigest: digest, sourceJson: JSON.stringify(retained) };
    expect(() => assert(output)).not.toThrow();
    for (const value of [
        null,
        { ...output, releaseDigest: "wrong" },
        { ...output, credentials: "must-not-leak" },
        { ...output, sourceJson: JSON.stringify({ ...retained, files: [source.files[0], source.files[0]] }) },
    ]) {
        expect(() => assert(value)).toThrow();
    }
    expect(() => sourceReadFixture("contract", source.namespace, implementation, 11, false)).toThrow();
    const sources = sourceReadInput(source, "get-contract-sources");
    expect(sources).toEqual({ namespace: source.namespace, contractId: source.id, version: "1.0.1" });
    expect(sourceReadInput(source, "get-source-snapshot")).toEqual({
        namespace: source.namespace,
        id: source.id,
        kind: "contract",
        version: "1.0.1",
    });
    validateSchemaValue({ type: "string", maxLength: 1048576 }, source.sourceJson);
});
