import { publicationCollection } from "../../../../repository/resources/collection";
import { buildReadSources } from "../../../../repository/catalogue-read/system/workload";
import { resourceRuntimeNamespace } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition } from "../../../../queries/types";
import type { ContractParentReference } from "@bernouy/ulvia-contracts";

export async function collectionReadResource(
    namespace: string,
    implementation: ContractParentReference,
    index: number,
    patch: number,
    expanded: boolean,
) {
    assertCondition(
        Number.isSafeInteger(index) &&
            index >= 0 &&
            index < 64 &&
            Number.isSafeInteger(patch) &&
            patch >= 0 &&
            patch < 128,
        "collection-read-resource-bound",
    );
    const suffix = `reader-${String(index).padStart(3, "0")}`;
    const original = resourceRuntimeNamespace(`${namespace}/fixture-collection-fixture`);
    const prefix = resourceRuntimeNamespace(`${namespace}/fixture-collection-${suffix}`);
    const files = expanded
        ? buildReadSources(namespace).map((file) => ({
              path: file.path.replaceAll(original, prefix),
              content: file.content.replaceAll(original, prefix),
          }))
        : [];
    const name = `Collection reader ${index} version ${patch}`;
    const description = `Controlled collection history revision ${patch}`;
    const resource = await publicationCollection(namespace, implementation, files, {
        suffix,
        version: `1.0.${patch}`,
        label: name,
        description,
        configuration: {
            schema: { type: "object", properties: { title: { type: "string", maxLength: 64 } }, required: ["title"] },
            defaults: { title: "Default" },
        },
    });
    assertCondition(
        resource.release.blocs.length === (expanded ? 65 : 1) &&
            resource.release.examples?.length === (expanded ? 65 : 1),
        "collection-read-real-complexity",
    );
    return { ...resource, index, patch, name, description };
}

export type CollectionReadResource = Awaited<ReturnType<typeof collectionReadResource>>;

export function nextCollectionReadCoordinate(
    resources: readonly Pick<CollectionReadResource, "index" | "patch">[],
    newIdentity: boolean,
) {
    assertCondition(resources.length > 0, "collection-read-coordinate-baseline");
    return {
        index: newIdentity ? Math.max(...resources.map((row) => row.index)) + 1 : 0,
        patch: newIdentity ? 0 : Math.max(...resources.filter((row) => row.index === 0).map((row) => row.patch)) + 1,
    };
}
