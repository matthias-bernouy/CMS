import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { listPreparedReleases } from "@bernouy/ulvia-cli/publication";
import type { RemoteCoordinate } from "@bernouy/repository/repository/publication";
import type { ImageArtifact } from "./images";
import { artifactHashes, fileHash } from "./files";

export type DistributionManifest = {
    schema: "ulvia.distribution.v1";
    version: string;
    revision: string;
    resources: readonly RemoteCoordinate[];
    images: readonly ImageArtifact[];
    files: Record<string, string>;
};

export async function writeManifest(root: string, version: string, revision: string, images: readonly ImageArtifact[]) {
    const manifest: DistributionManifest = {
        schema: "ulvia.distribution.v1",
        version,
        revision,
        resources: await listPreparedReleases(join(root, "repository")),
        images,
        files: await artifactHashes(root),
    };
    await validateManifest(root, version, manifest);
    await writeFile(join(root, "manifest.json"), `${JSON.stringify(manifest, null, 4)}\n`);
    return manifest;
}

export async function readManifest(root: string, version: string): Promise<DistributionManifest> {
    const manifest: DistributionManifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
    await validateManifest(root, version, manifest);
    return manifest;
}

async function validateManifest(root: string, version: string, manifest: DistributionManifest): Promise<void> {
    const files = await artifactHashes(root);
    if (
        manifest?.schema !== "ulvia.distribution.v1" ||
        manifest.version !== version ||
        !/^[0-9a-f]{40}$/u.test(manifest.revision) ||
        !Array.isArray(manifest.images) ||
        manifest.images.length !== 2 ||
        !same(manifest.files, files) ||
        !same(manifest.resources, await listPreparedReleases(join(root, "repository")))
    ) {
        throw new Error("Invalid or modified distribution artifacts; rebuild before publishing");
    }
    const archive = `cyaxis-ulvia-${version}.tgz`;
    const receipt = JSON.parse(await readFile(join(root, "cli", `cyaxis-ulvia-${version}.json`), "utf8"));
    if (
        receipt.schema !== "ulvia.cli-release.v1" ||
        receipt.package !== "@cyaxis/ulvia" ||
        receipt.version !== version ||
        receipt.stackVersion !== version ||
        receipt.revision !== manifest.revision ||
        receipt.archive !== archive ||
        receipt.sha256 !== (await fileHash(join(root, "cli", archive)))
    ) {
        throw new Error("CLI receipt does not match the distribution");
    }
}

export function same(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}
