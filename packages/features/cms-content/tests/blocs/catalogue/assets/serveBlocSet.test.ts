import { expect, test } from "bun:test";
import { InMemoryCache } from "@bernouy/http-runner";
import { serveBlocSet } from "@bernouy/cms-content/http";

test("serves bloc sets with opaque composite content revisions", async () => {
    const revision = `sha256:${"a".repeat(64)}`;
    const request = new Request(
        `http://localhost/_content/blocset?tags=fixture-card&r=${encodeURIComponent(revision)}`,
    );
    const response = await serveBlocSet(request, {
        content: { getBlocViewJS: async () => "cmsRuntime.registerBloc('fixture-card', { mount() {} })" },
        cache: new InMemoryCache(),
        resolveContributedAssets: async (source) => source,
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("fixture-card");
});

test("returns transportable HTTP errors for invalid bloc set requests", async () => {
    const response = await serveBlocSet(new Request("http://localhost/_content/blocset?tags=fixture-card"), {
        content: { getBlocViewJS: async () => null },
        cache: new InMemoryCache(),
        resolveContributedAssets: async (source) => source,
    });
    expect(response.status).toBe(400);
});

test("rejects unbounded bloc set cache dimensions", async () => {
    const options = {
        content: { getBlocViewJS: async () => null },
        cache: new InMemoryCache(),
        resolveContributedAssets: async (source: string) => source,
    };
    const revision = `sha256:${"a".repeat(64)}`;
    const tooManyTags = Array.from({ length: 129 }, (_, index) => `fixture-${index}`).join(",");

    expect(
        (
            await serveBlocSet(
                new Request(`http://localhost/_content/blocset?tags=${tooManyTags}&r=${revision}`),
                options,
            )
        ).status,
    ).toBe(400);
    expect(
        (await serveBlocSet(new Request("http://localhost/_content/blocset?tags=fixture-card&r=opaque"), options))
            .status,
    ).toBe(400);
});

test("immutable bloc sets reject a different generation after a collection change or process restart", async () => {
    let script = "cmsRuntime.registerBloc('fixture-card', { mount() {} })";
    const options = {
        content: { getBlocViewJS: async () => script },
        cache: new InMemoryCache(),
        resolveContributedAssets: async (source: string) => source,
    };
    const url = "http://localhost/_content/blocset?tags=fixture-card&r=sha256:" + "a".repeat(64);
    const initial = await serveBlocSet(new Request(url), options);
    const version = initial.headers.get("etag")!.slice(1, 11);
    expect((await serveBlocSet(new Request(url + "&v=" + version), options)).status).toBe(200);
    script = "cmsRuntime.registerBloc('fixture-card', { mount() { console.log('new'); } })";
    // A warm old generation may continue serving its exact immutable bytes.
    expect(await (await serveBlocSet(new Request(url + "&v=" + version), options)).text()).not.toContain("new");
    const restarted = { ...options, cache: new InMemoryCache() };
    const stale = await serveBlocSet(new Request(url + "&v=" + version), restarted);
    expect(stale.status).toBe(404);
    expect(stale.headers.get("cache-control")).toBe("no-store");
    expect((await serveBlocSet(new Request(url + "&v=" + version + "&v=" + version), restarted)).status).toBe(400);
    const nextUrl = url.replace("a".repeat(64), "b".repeat(64));
    const next = await serveBlocSet(new Request(nextUrl), restarted);
    expect(await next.text()).toContain("new");
    expect(next.headers.get("etag")).not.toBe(initial.headers.get("etag"));
});
