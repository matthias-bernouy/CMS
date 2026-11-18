import { expect, test } from "bun:test";
import { admitCollectionReleaseJson } from "@bernouy/repository/collections";
import { parsePublicationUpload } from "@bernouy/repository/repository/publication";
import { resourceRuntimeNamespace } from "@bernouy/ulvia-contracts/protocol";
import { performanceCapabilityInventory } from "../../../../../capabilities/inventory";
import { collectionReadResource } from "../resources/collection";
import { collectionMetadata, installedCollectionDetail } from "../resources/expected";

test("collection reader corpora contain actual admitted component/example volume, typed configuration and immutable versions", async () => {
    const inventory = await performanceCapabilityInventory();
    const implementation = inventory.targets.find(
        (row) => !row.retained && row.release.contractId === "ulvia/cms.content",
    )!.release;
    const namespace = `performance-read-${"a".repeat(32)}`;
    for (const [index, patch, expanded] of [
        [0, 0, true],
        [63, 127, false],
    ] as const) {
        const resource = await collectionReadResource(namespace, implementation, index, patch, expanded);
        const admitted = await admitCollectionReleaseJson(
            resource.canonicalJson,
            resource.assets.map(({ id, bytes }) => ({ id, bytes })),
        );
        expect(admitted.digest).toBe(resource.digest);
        expect(admitted.release.blocs).toHaveLength(expanded ? 65 : 1);
        expect(admitted.release.examples).toHaveLength(expanded ? 65 : 1);
        expect(admitted.release.configuration?.defaults).toEqual({ title: "Default" });
        expect(admitted.release.theme).toBeUndefined();
        expect(admitted.release.texts ?? []).toEqual([]);
        expect(admitted.release.blocs.every((bloc) => bloc.id.startsWith(resourceRuntimeNamespace(resource.id)))).toBe(
            true,
        );
        const upload = parsePublicationUpload(resource.manifest);
        expect(upload.canonicalJson).toBe(resource.canonicalJson);
        expect(upload.sourceJson).toBe(resource.sourceJson);
        expect(collectionMetadata(resource, "unit-source")).toMatchObject({
            name: resource.name,
            blocCount: expanded ? 65 : 1,
            browserRisk: "none",
            javaScriptBlocCount: 0,
        });
        expect(installedCollectionDetail(resource, "unit-source", 3, "Changed")).toMatchObject({
            version: `1.0.${patch}`,
            revision: 3,
            configurationJson: '{"title":"Changed"}',
            overriddenLocaleCount: 0,
        });
    }
    await expect(collectionReadResource(namespace, implementation, 64, 0, false)).rejects.toThrow("bound");
    await expect(collectionReadResource(namespace, implementation, 0, 128, false)).rejects.toThrow("bound");
}, 30_000);
