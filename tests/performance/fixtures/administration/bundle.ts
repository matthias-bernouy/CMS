import { resolve } from "node:path";
import { verifyStoredCollectionArtifact } from "@bernouy/repository/collections";
import type { CollectionRelease } from "@bernouy/repository/collections";
import type { Dataset } from "../../scenarios/initialization/datasets";

export const MOSSA_DIGEST = "sha256:c9e14a512f09aa4f680ff4447cb5253040533d9e17c3756738696089535de41a";
export const MOSSA_FIXTURE = resolve(import.meta.dir, "mossa-1.18.0.json.gz");

/** Immutable regression evidence, never refreshed from the live Repository during a test. */
export async function administrationBundle() {
    const bytes = new Uint8Array(await Bun.file(MOSSA_FIXTURE).arrayBuffer());
    const input = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(bytes))) as {
        release: CollectionRelease;
        assets: { id: string; base64: string }[];
    };
    const assets = input.assets.map(({ id, base64 }) => ({ id, bytes: Buffer.from(base64, "base64") }));
    return verifyStoredCollectionArtifact(input.release, assets, MOSSA_DIGEST);
}

export function administrationDataset(
    release: CollectionRelease,
    digest: `sha256:${string}`,
    bootstrapId = "administration",
): Dataset {
    const recipe = release.bootstraps?.find(({ id }) => id === bootstrapId);
    if (!recipe) {
        throw new Error("Pinned administration recipe is unavailable");
    }
    return {
        root: {
            publisherId: release.publisherId,
            collectionId: release.collectionId,
            version: release.version,
            digest,
            bootstrapId,
        },
        paths: recipe.pages.map(({ path }) => path),
        collections: 1,
        pages: recipe.pages.map((page) => ({
            path: page.path,
            title: release.translations.en![page.title]!,
            description: release.translations.en![page.description]!,
            visible: page.visible,
            indexing: page.indexing,
            ...(page.systemRole ? { systemRole: page.systemRole } : {}),
        })),
    };
}
