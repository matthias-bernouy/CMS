import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OwnedPublicationUploadManifest } from "repository/repository/publication/types";
import { FilesystemRepositoryPublicationUploadStore } from "repository/repository/filesystem/mutations/uploadStore";

export function manifest(patch: Partial<OwnedPublicationUploadManifest> = {}): OwnedPublicationUploadManifest {
    return {
        kind: "provider-manifest",
        canonicalJson: "{}",
        assets: [],
        owner: { accountId: "fixture-owner", namespace: "publisher", namespaceRevision: 1 },
        ...patch,
    };
}

export async function uploadFixture() {
    const root = await mkdtemp(join(tmpdir(), "bounded-uploads-"));
    const stores: FilesystemRepositoryPublicationUploadStore[] = [];
    const open = () => {
        const store = new FilesystemRepositoryPublicationUploadStore(root);
        stores.push(store);
        return store;
    };
    return {
        root,
        open,
        expiry: () => new Date(Date.now() + 60_000),
        async close() {
            await Promise.all(stores.map((store) => store.close()));
            await rm(root, { recursive: true, force: true });
        },
    };
}
