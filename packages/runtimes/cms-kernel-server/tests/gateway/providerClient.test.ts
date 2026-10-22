import { expect, test } from "bun:test";
import { REQUEST_ID_HEADER, runWithRequestContext } from "@bernouy/http-runner/observability";
import { clientFixture } from "./providerClient.fixture";

test("forwards remaining content-owned streaming endpoints with their canonical Provider paths", async () => {
    const { client, requests } = clientFixture(() => new Response("ok"));
    await client.collectionAsset(
        new Request("https://kernel.test/.cms/collections/collection-a/assets/logo.svg?download=1"),
    );
    await client.sitemap(new Request("https://kernel.test/sitemap-1.xml"));

    expect(requests.map((request) => `${request.url.pathname}${request.url.search}`)).toEqual([
        "/ulvia/kernel/v1/collections/collection-a/assets/logo.svg?download=1",
        "/ulvia/kernel/v1/sitemap/resource",
    ]);
    expect(new Headers(requests[1]?.init.headers).get("x-ulvia-original-path")).toBe("/sitemap-1.xml");
});

test("propagates the current request id through forwarded requests", async () => {
    const requestId = "11d38c6a-0e6a-4f68-9dad-2a92c17b8300";
    const { client, requests } = clientFixture(() => new Response("ok"));
    const inbound = new Request("https://kernel.test/admin", {
        headers: { [REQUEST_ID_HEADER]: requestId },
    });

    await runWithRequestContext(inbound, async () => {
        await client.collectionAsset(new Request("https://kernel.test/.cms/collections/shop/assets/logo.svg"));
    });

    expect(new Headers(requests[0]?.init.headers).get(REQUEST_ID_HEADER)).toBe(requestId);
});
