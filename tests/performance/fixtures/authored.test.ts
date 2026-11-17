import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { prepareCollectionRelease } from "@bernouy/repository/collections/build";
import { prepareContractSource } from "@bernouy/repository/repository/authoring/build";
import { InMemoryReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";
import { admitProviderManifestJson } from "@bernouy/ulvia-providers";
import { authoredFixture } from "./authored";
import { inventoryFixture } from "./inventory";

test("authored performance sources compile and admit before real publishing scenarios use them", async () => {
    const fixture = await inventoryFixture();
    const catalogue = new InMemoryReleaseCatalogue();
    for (const contract of fixture.build.contracts) {
        await catalogue.publish(contract);
    }
    for (const kind of ["collection", "contract", "provider-manifest"] as const) {
        const source = authoredFixture(kind, "performance-authoring", fixture.target.release, "sample");
        const root = await mkdtemp(join(tmpdir(), "ulvia-performance-authored-"));
        const directory = join(root, source.id.split("/")[1]!);
        try {
            const snapshot = JSON.parse(source.sourceJson);
            for (const file of snapshot.files) {
                const path = join(directory, file.path);
                await mkdir(dirname(path), { recursive: true });
                await writeFile(path, file.content);
            }
            if (kind === "collection") {
                const admitted = await prepareCollectionRelease(directory);
                expect(admitted.release.collectionId).toBe(source.id);
            } else if (kind === "contract") {
                const prepared = await prepareContractSource(directory);
                expect(prepared.admission.release.contractId).toBe(source.id);
            } else {
                const admitted = await admitProviderManifestJson(
                    await Bun.file(join(directory, "definition.json")).text(),
                    catalogue,
                );
                expect(admitted.manifest.providerId).toBe(source.id);
            }
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    }
});
