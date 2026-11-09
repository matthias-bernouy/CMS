import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AuthoringSourceSnapshot, SourceAsset } from "../../snapshot";
import { AUTHORING_SOURCE_LIMITS } from "./limits";

/** Write a validated snapshot into a reserved private workspace, resolving each asset once. */
export async function materializeSourceSnapshot(
    directory: string,
    snapshot: AuthoringSourceSnapshot,
    readAsset: (asset: SourceAsset) => Promise<Blob>,
    limits: Readonly<{ assetBytes: number; assetBundleBytes: number }> = AUTHORING_SOURCE_LIMITS,
) {
    for (const file of snapshot.files) {
        await writeSourceFile(directory, file.path, file.content);
    }
    let bytes = 0;
    for (const asset of snapshot.assets) {
        const blob = await readAsset(asset);
        bytes += blob.size;
        if (blob.size > limits.assetBytes || bytes > limits.assetBundleBytes) {
            throw new Error("Source assets exceed the preparation limit");
        }
        await writeSourceFile(directory, asset.path, new Uint8Array(await blob.arrayBuffer()));
    }
}

async function writeSourceFile(directory: string, relativePath: string, content: string | Uint8Array) {
    const path = join(directory, relativePath);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, content, { flag: "wx", mode: 0o600 });
}
