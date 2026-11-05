import { expect, test } from "bun:test";
import { compress, InMemoryCache } from "@bernouy/http-runner";
import { serveBlocStyles } from "@bernouy/cms-content/http";

const revision = `sha256:${"a".repeat(64)}`;
const content = {
    getRenderableBlocs: async () => [
        {
            id: "example--fixture--card",
            root: { accepts: ["div"] as const },
            styleCSS: '@scope ([cms-bloc="example--fixture--card"]) { :scope { color: red; } }',
            styleCollectionId: "example/fixture",
            hasBehavior: false,
        },
        {
            id: "other--admin--panel",
            root: { accepts: ["div"] as const },
            styleCSS: '@scope ([cms-bloc="other--admin--panel"]) { :scope { color: blue; } }',
            styleCollectionId: "other/admin",
            hasBehavior: false,
        },
    ],
};

test("serves only requested immutable CSS fragments from their owning collection", async () => {
    const css = '@scope ([cms-bloc="example--fixture--card"]) { :scope { color: red; } }';
    const version = compress(css, "text/css").hash;
    const request = new Request(
        `http://localhost/_content/blocstyles?collection=example%2Ffixture&tags=example--fixture--card&r=${revision}&v=${version}`,
    );
    const response = await serveBlocStyles(request, {
        content,
        cache: new InMemoryCache(),
        resolveContributedAssets: async (source) => source,
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("example--fixture--card");
});

test("rejects invalid or cross-collection CSS bundle requests", async () => {
    const options = {
        content,
        cache: new InMemoryCache(),
        resolveContributedAssets: async (source: string) => source,
    };
    expect((await serveBlocStyles(new Request("http://localhost/_content/blocstyles"), options)).status).toBe(400);
    expect(
        (
            await serveBlocStyles(
                new Request(
                    `http://localhost/_content/blocstyles?collection=example%2Ffixture&tags=other--admin--panel&r=${revision}&v=0000000000`,
                ),
                options,
            )
        ).status,
    ).toBe(404);
    expect(
        (
            await serveBlocStyles(
                new Request(
                    `http://localhost/_content/blocstyles?collection=example%2Ffixture&tags=example--fixture--card,example--fixture--card&r=${revision}&v=0000000000`,
                ),
                options,
            )
        ).status,
    ).toBe(400);
});
