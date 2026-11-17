import { lstat, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ImageArtifact } from "../images/inspection";
import { catalogueHash, fileHash } from "./files";

export type BuildReceipt = {
    package: string;
    version: string;
    stackVersion: string;
    revision: string;
    archive: string;
    sha256: string;
    images: readonly ImageArtifact[];
    catalogueSha256: string;
};

export function receiptPath(root: string, version: string): string {
    return join(root, "cli", `cyaxis-ulvia-${version}.json`);
}

/** Complete the existing CLI receipt in place; an unfinished build cannot be published. */
export async function completeReceipt(
    root: string,
    version: string,
    revision: string,
    images: readonly ImageArtifact[],
) {
    const path = receiptPath(root, version);
    const receipt = await loadReceipt(root, version);
    if (receipt?.revision !== revision) {
        throw new Error("CLI receipt does not match the build revision");
    }
    await writeFile(
        path,
        `${JSON.stringify({ ...receipt, images, catalogueSha256: await catalogueHash(join(root, "repository")) }, null, 4)}\n`,
    );
    return readReceipt(root, version);
}

export async function readReceipt(root: string, version: string): Promise<BuildReceipt> {
    const receipt: BuildReceipt = await loadReceipt(root, version);
    const archive = `cyaxis-ulvia-${version}.tgz`;
    if (
        receipt?.package !== "@cyaxis/ulvia" ||
        receipt.version !== version ||
        receipt.stackVersion !== version ||
        !/^[0-9a-f]{40}$/u.test(receipt.revision) ||
        receipt.archive !== archive ||
        !Array.isArray(receipt.images) ||
        receipt.images.length !== 2 ||
        receipt.sha256 !== (await fileHash(join(root, "cli", archive))) ||
        receipt.catalogueSha256 !== (await catalogueHash(join(root, "repository")))
    ) {
        throw new Error("Invalid or modified build artifacts; rebuild before publishing");
    }
    return receipt;
}

async function loadReceipt(root: string, version: string) {
    const path = receiptPath(root, version);
    const directory = await lstat(join(root, "cli"));
    const file = await lstat(path);
    if (!directory.isDirectory() || directory.isSymbolicLink() || !file.isFile() || file.isSymbolicLink()) {
        throw new Error("Build receipt must be a regular file in a real CLI directory");
    }
    return JSON.parse(await readFile(path, "utf8"));
}
