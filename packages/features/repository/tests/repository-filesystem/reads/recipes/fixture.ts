import { afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { admitCollectionRelease } from "@bernouy/repository/collections";
import { inlineCollectionVerifier } from "@bernouy/repository/collections/sources";
import {
    FilesystemRepositoryCatalogueIndex,
    FilesystemRegistryReads,
    LocalCollectionRepository,
    FilesystemRepositoryPublicationRegistry,
} from "@bernouy/repository/repository/filesystem";
import { bootstrapCollection } from "../../../collections/admission/examples/bootstraps/fixture";

const roots = new Set<string>();
afterEach(async () => {
    for (const root of roots) {
        await rm(root, { recursive: true, force: true });
        roots.delete(root);
    }
});

export async function recipeFixture() {
    const root = await mkdtemp(join(tmpdir(), "recipe-index-"));
    roots.add(root);
    const counts = { verifications: 0 };
    const verifier = {
        ...inlineCollectionVerifier,
        metadataJson: (...args: Parameters<typeof inlineCollectionVerifier.metadataJson>) => {
            counts.verifications++;
            return inlineCollectionVerifier.metadataJson(...args);
        },
    };
    const index = new FilesystemRepositoryCatalogueIndex(root, verifier);
    const reads = new FilesystemRegistryReads(root, index, verifier);
    const store = new LocalCollectionRepository(root);
    const registry = new FilesystemRepositoryPublicationRegistry(root, index);
    const artifact = async (version = "1.0.0", recipes = true, name = "atlas") => {
        const document = JSON.parse(
            JSON.stringify(bootstrapCollection())
                .replaceAll("atlas.official/atlas", `atlas.official/${name}`)
                .replaceAll("atlas-dofficial--atlas", `atlas-dofficial--${name}`),
        );
        document.version = version;
        document.translations.fr = { ...document.translations.en, "bootstrap.label": "Administration française" };
        if (!recipes) {
            delete document.bootstraps;
        }
        return admitCollectionRelease(document);
    };
    const add = async (version = "1.0.0", recipes = true, name = "atlas") => {
        const value = await artifact(version, recipes, name);
        await store.store(value);
        index.invalidate();
        return value;
    };
    const projectionPath = (version = "1.0.0", name = "atlas") =>
        join(root, "recipe-projections/atlas.official", name, `${version}.json`);
    return { root, index, reads, store, registry, artifact, add, counts, projectionPath };
}
