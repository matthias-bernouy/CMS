import { expect, test } from "bun:test";
import { InMemoryCache } from "@bernouy/http-runner";
import { serveBlocSet } from "@bernouy/cms-content/http";

test("serves bloc sets with opaque composite content revisions", async () => {
    const revision = `sha256:${"a".repeat(64)}`;
    const request = new Request(
        `http://localhost/.cms/blocset?tags=fixture-card&r=${encodeURIComponent(revision)}&v=hash`,
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
    const response = await serveBlocSet(new Request("http://localhost/.cms/blocset?tags=fixture-card"), {
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
        (await serveBlocSet(new Request(`http://localhost/.cms/blocset?tags=${tooManyTags}&r=${revision}`), options))
            .status,
    ).toBe(400);
    expect(
        (await serveBlocSet(new Request("http://localhost/.cms/blocset?tags=fixture-card&r=opaque"), options)).status,
    ).toBe(400);
});
