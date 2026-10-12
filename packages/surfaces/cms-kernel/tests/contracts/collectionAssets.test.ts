import { expect, test } from "bun:test";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import type { ContentReader } from "@bernouy/cms-content/rendering";
import { TtlCache } from "@bernouy/http-runner";
import KernelCms from "cms-kernel/KernelCms";
import { CaptureRunner } from "../gateway/support/CaptureRunner";

test("mounts installed collection assets below the tenant path", async () => {
    const runner = new CaptureRunner("/site");
    new KernelCms({
        runner,
        cache: new TtlCache(),
        content: {} as ContentReader,
        authentication: new InMemoryAuthentication(),
        collectionAssets: {
            siteId: "site",
            store: {
                getInstalledAssetMetadata: async () => null,
                getInstalledAssetMetadataBatch: async () => new Map(),
                getReleaseAsset: async () => null,
            },
        },
    });

    const handler = runner.defaultHandler("GET", "/site/.cms/collections");
    const response = await handler(
        new Request("https://example.test/site/.cms/collections/design-system/assets/missing.svg"),
    );

    expect(response.status).toBe(404);
});
