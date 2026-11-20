import type { CollectionStore } from "repository/collections/installations/core/CollectionStore";
import type { ExampleCaptureInput, CaptureSource } from "@bernouy/content/captures";
import { ContentCapabilityError } from "@bernouy/content/feature";
import { CaptureError, CAPTURE_LIMITS } from "@bernouy/browser-capture";
import type { AdmittedCollectionRelease } from "repository/collections/interfaces/CollectionAdmission";
import { verifyStoredCollectionArtifact } from "repository/collections/core/admission/collectionArtifact";
import { renderCollectionExamples } from "./render";

export async function exampleCaptureDocument(
    artifact: AdmittedCollectionRelease,
    dependencies: readonly AdmittedCollectionRelease[],
    input: Omit<ExampleCaptureInput, "collectionId">,
    source: CaptureSource,
) {
    const exported = await renderCollectionExamples(artifact, dependencies, undefined, {
        locale: input.locale,
        themeMode: input.themeMode,
        exampleId: input.exampleId,
        previewId: input.previewId,
    });
    const frame = exported.frames[0];
    if (!frame) {
        throw new CaptureError("INVALID_INPUT");
    }
    return { document: { path: frame.path, files: exported.files }, source, width: frame.width, height: frame.height };
}
/** Only the selected collection and its transitive dependencies load assets. */
export async function installedExampleCaptureDocument(
    store: CollectionStore,
    siteId: string,
    input: ExampleCaptureInput,
) {
    const revision = await store.revision(siteId);
    const artifacts = new Map<string, AdmittedCollectionRelease>();
    let bytes = 0;
    const read = async (collectionId: string): Promise<void> => {
        if (artifacts.has(collectionId)) {
            return;
        }
        if (artifacts.size >= 32) {
            throw new CaptureError("LIMIT_EXCEEDED");
        }
        const installed = await store.readInstalled(siteId, collectionId);
        if (!installed || installed.revision !== revision) {
            throw new ContentCapabilityError(installed ? "REVISION_CONFLICT" : "NOT_FOUND");
        }
        const release = installed.collection.release;
        const assets = [];
        for (const asset of release.assets) {
            bytes += asset.byteLength;
            if (bytes > CAPTURE_LIMITS.inputBytes) {
                throw new CaptureError("LIMIT_EXCEEDED");
            }
            const value = await store.getReleaseAsset(installed.collection.digest, asset.id);
            if (!value) {
                throw new CaptureError("UNAVAILABLE");
            }
            assets.push({ id: asset.id, bytes: value });
        }
        artifacts.set(collectionId, await verifyStoredCollectionArtifact(release, assets, installed.collection.digest));
        for (const dependency of release.dependencies ?? []) {
            await read(dependency.collectionId);
        }
    };
    await read(input.collectionId);
    const artifact = artifacts.get(input.collectionId)!;
    const dependencies = [...artifacts.values()].filter((value) => value !== artifact);
    const output = await exampleCaptureDocument(artifact, dependencies, input, {
        kind: "installed-example",
        id: `${input.collectionId}/${input.exampleId}/${input.previewId}`,
        revision: String(revision),
        releaseDigest: artifact.digest,
        dependencies: dependencies.map((item) => ({ id: item.release.collectionId, digest: item.digest })),
    });
    if ((await store.revision(siteId)) !== revision) {
        throw new ContentCapabilityError("REVISION_CONFLICT");
    }
    return output;
}
