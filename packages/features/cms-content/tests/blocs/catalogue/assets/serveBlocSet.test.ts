import { expect, test } from "bun:test";
import { InMemoryCache } from "@bernouy/http-runner";
import { serveBlocSet } from "@bernouy/cms-content/http";

test("serves bloc sets with opaque composite content revisions", async () => {
    const revision = `1:${JSON.stringify({ kind: "contribution", sourceId: "ulvia.official" })}:/admin:1`;
    const request = new Request(
        `http://localhost/.cms/blocset?tags=fixture-card&r=${encodeURIComponent(revision)}&v=hash`,
    );
    const response = await serveBlocSet(request, {
        content: { getBlocViewJS: async () => "customElements.define('fixture-card', class extends HTMLElement {})" },
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
