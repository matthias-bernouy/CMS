import { expect, test } from "bun:test";
import { publicAssetSources } from "../../../src/runtime/content/assetSources";
import { resourceAssetUrl } from "@bernouy/resources/delivery";

test("the temporary asset bridge reads legacy metadata only for unresolved references and preserves exact legacy URLs", async () => {
    let ordinary = 0;
    let legacy = 0;
    const asset = {
        namespace: "acme/base",
        id: "test.txt",
        mediaType: "text/plain",
        byteLength: 1,
        digest: `sha256:${"a".repeat(64)}`,
    };
    const installed = { id: "test.txt", mediaType: "text/plain", byteLength: 1, digest: `sha256:${"b".repeat(64)}` };
    const refs: unknown[] = [];
    const resolve = publicAssetSources(
        {
            getMetadata: async () => {
                ordinary++;
                return [asset];
            },
        } as never,
        {
            siteId: "default",
            store: {
                getInstalledAssetMetadataBatch: async (siteId: string, input: unknown) => {
                    expect(siteId).toBe("default");
                    legacy++;
                    refs.push(input);
                    return [{ collectionId: "acme/old", asset: installed }];
                },
            },
        } as never,
    );
    const current = "{{ cms.asset.acme/base.test.txt }}";
    expect((await resolve([current])).get(current)).toBe(resourceAssetUrl(asset));
    expect(ordinary).toBe(1);
    expect(legacy).toBe(0);
    const mixed = current + " {{ cms.asset.acme/old.test.txt }}";
    const result = (await resolve([mixed])).get(mixed)!;
    expect(result).toStartWith(resourceAssetUrl(asset) + " /_content/collections/acme%2Fold/assets/test.txt?v=");
    expect(ordinary).toBe(2);
    expect(legacy).toBe(1);
    expect(refs).toEqual([[{ collectionId: "acme/old", assetId: "test.txt" }]]);
});
