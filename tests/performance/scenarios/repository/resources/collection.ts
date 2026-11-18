import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileCollectionSources } from "@bernouy/repository/repository/authoring/build";
import { encodePublicationUpload } from "@bernouy/repository/repository/publication";
import { authoredFixture } from "../../../fixtures/authored";
import type { ContractParentReference } from "@bernouy/ulvia-contracts";
import type { CollectionRelease } from "@bernouy/repository/collections";

/** Compile authored bytes locally during preparation; measured builds still compile inside the real Provider. */
export async function publicationCollection(
    namespace: string,
    implementation: ContractParentReference,
    extraFiles: readonly Readonly<{ path: string; content: string }>[] = [],
    options: Readonly<{
        suffix?: string;
        version?: string;
        configuration?: CollectionRelease["configuration"];
        label?: string;
        description?: string;
    }> = {},
) {
    const authored = authoredFixture("collection", namespace, implementation, options.suffix ?? "fixture");
    const files = JSON.parse(authored.sourceJson).files as { path: string; content: string }[];
    if (options.version || options.configuration || options.description !== undefined) {
        const definition = files.find((file) => file.path === "definition.json")!;
        definition.content = JSON.stringify({
            ...JSON.parse(definition.content),
            ...(options.version ? { version: options.version } : {}),
            ...(options.configuration ? { configuration: options.configuration } : {}),
            ...(options.description === undefined ? {} : { description: "collection.description" }),
        });
    }
    if (options.label !== undefined || options.description !== undefined) {
        const translation = files.find((file) => file.path === "translations/en/base.json")!;
        translation.content = JSON.stringify({
            ...JSON.parse(translation.content),
            ...(options.label === undefined ? {} : { "collection.name": options.label }),
            ...(options.description === undefined ? {} : { "collection.description": options.description }),
        });
    }
    const bytes = new TextEncoder().encode("Immutable performance collection asset.\n");
    const sourceJson = JSON.stringify({
        files: [...files, ...extraFiles],
        assets: [{ path: "assets/performance.txt", fileId: "fixture-bytes", generation: "fixture-generation" }],
    });
    const workspace = await mkdtemp(join(tmpdir(), "ulvia-performance-collection-"));
    try {
        const compiled = await compileCollectionSources(workspace, sourceJson, [{ id: "performance.txt", bytes }]);
        const { canonicalJson, digest, release } = compiled.admission;
        const declarations = release.assets.map(({ id, digest: assetDigest, byteLength }) => ({
            id,
            digest: assetDigest,
            byteLength,
        }));
        const assets = await Promise.all(
            compiled.admission.assets.map(async (asset) => ({
                id: asset.id,
                bytes: new Uint8Array(await asset.bytes.arrayBuffer()),
                digest: declarations.find(({ id }) => id === asset.id)!.digest,
            })),
        );
        return {
            ...authored,
            version: release.version,
            canonicalJson,
            digest,
            assets,
            sourceJson: compiled.sourceJson,
            manifest: encodePublicationUpload({
                kind: "collection",
                canonicalJson,
                assets: declarations,
                sourceJson: compiled.sourceJson,
            }),
            release,
        };
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
}
