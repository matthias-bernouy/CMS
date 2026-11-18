import { assertCondition } from "../../../queries/types";
import type { CatalogueContract } from "./contract";
import type { CatalogueProvider } from "./provider";
import type { registryCalls } from "../../../repository/client";

export async function publishCatalogueResource(
    calls: ReturnType<typeof registryCalls>,
    revision: number,
    resource: CatalogueContract | CatalogueProvider,
) {
    const scope = { namespace: resource.namespace, namespaceRevision: revision };
    const upload = await calls.fixture("publication-begin", { ...scope, manifest: resource.manifest });
    const input = { ...scope, uploadId: upload.uploadId };
    for (const asset of resource.assets) {
        await calls.checked("publication-asset", {
            ...input,
            assetId: asset.id,
            bytes: asset.bytes,
            contentDigest: asset.digest,
        });
    }
    const receipt = await calls.fixture("publication-commit", input);
    assertCondition(
        receipt.kind === resource.kind && receipt.digest === resource.digest && receipt.added === true,
        "metadata-catalogue-publication-receipt",
    );
}
