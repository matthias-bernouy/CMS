import { mkdir, mkdtemp, writeFile, rm, readdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { prepareCollectionRelease } from "cms-repository/exports/collections/build";
import { parseSourceSnapshot, canonicalSourceSnapshot, type SourceAsset } from "./snapshot";
import type { ReleaseCatalogue } from "cms-repository/exports/contracts/catalogue";
import { collectionBrowserRisk, collectionBrowserRiskDigest } from "cms-repository/exports/collections/index";
import { createHash, randomUUID } from "node:crypto";

export interface AuthoringHost {
    readonly root: string;
    readonly contracts: ReleaseCatalogue;
    readonly readAsset: (asset: SourceAsset) => Promise<Blob>;
}

export async function prepareRemoteCollection(host: AuthoringHost, sourceJson: string) {
    const snapshot = parseSourceSnapshot(sourceJson);
    const definition = JSON.parse(snapshot.files.find((file) => file.path === "definition.json")!.content);
    const collectionId = definition.collectionId;
    if (typeof collectionId !== "string" || !/^[a-z][a-z0-9-]{0,95}$/u.test(collectionId)) {
        throw new Error("Invalid collection ID");
    }
    await mkdir(host.root, { recursive: true, mode: 0o700 });
    await expirePrepared(host.root);
    const work = await mkdtemp(join(host.root, "prepare-"));
    const directory = join(work, collectionId);
    let bytes = Buffer.byteLength(sourceJson);
    try {
        for (const file of snapshot.files) {
            const path = join(directory, file.path);
            await mkdir(dirname(path), { recursive: true, mode: 0o700 });
            await writeFile(path, file.content, { flag: "wx", mode: 0o600 });
        }
        for (const asset of snapshot.assets) {
            const blob = await host.readAsset(asset);
            bytes += blob.size;
            if (blob.size > 16 * 1024 * 1024 || bytes > 64 * 1024 * 1024) {
                throw new Error("Collection source assets exceed the preparation limit");
            }
            const path = join(directory, asset.path);
            await mkdir(dirname(path), { recursive: true, mode: 0o700 });
            await writeFile(path, new Uint8Array(await blob.arrayBuffer()), { flag: "wx", mode: 0o600 });
        }
        const artifact = await prepareCollectionRelease(directory, host.contracts);
        const digest = artifact.digest;
        const id = randomUUID();
        const assets = snapshot.assets.map((asset) => ({
            path: asset.path,
            publisherId: artifact.release.publisherId,
            collectionId,
            version: artifact.release.version,
            releaseDigest: digest,
            assetId: asset.path.slice(7),
        }));
        const retainedSources = canonicalSourceSnapshot({ files: snapshot.files, assets });
        if (Buffer.byteLength(retainedSources) > 1024 * 1024) {
            throw new Error("Retained collection sources exceed 1 MiB");
        }
        await writeFile(
            join(work, "prepared.json"),
            JSON.stringify({
                id,
                digest,
                sourceJson: retainedSources,
                directory: collectionId,
                canonicalJson: artifact.canonicalJson,
            }),
            { mode: 0o600, flag: "wx" },
        );
        const { rename } = await import("node:fs/promises");
        await rename(work, join(host.root, id));
        const browserRisk = collectionBrowserRisk(artifact.release);
        return {
            preparationId: id,
            publisherId: artifact.release.publisherId,
            collectionId,
            version: artifact.release.version,
            digest,
            sourceDigest: `sha256:${createHash("sha256").update(retainedSources).digest("hex")}`,
            approvedBrowserRiskDigest: collectionBrowserRiskDigest(browserRisk),
            browserRisk: browserRisk.level,
        };
    } catch (error) {
        await rm(work, { recursive: true, force: true });
        throw error;
    }
}

async function expirePrepared(root: string) {
    let retained = 0;
    for (const entry of await readdir(root, { withFileTypes: true })) {
        if (!entry.isDirectory() || !/^(?:prepare-|[a-f0-9-]{36}$)/u.test(entry.name)) {
            continue;
        }
        const path = join(root, entry.name);
        if ((await stat(path)).mtimeMs < Date.now() - 7 * 86400_000) {
            await rm(path, { recursive: true, force: true });
        } else {
            retained += 1;
        }
    }
    if (retained >= 64) {
        throw new Error("Prepared collection limit reached; remove an old preparation before adding more");
    }
}
