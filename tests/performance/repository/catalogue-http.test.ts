import { expect, test } from "bun:test";
import { HttpCollectionRepository } from "@bernouy/cms-repository/collections/http";
import { HttpProviderRepository } from "@bernouy/cms-repository/providers/http";

const digest = `sha256:${"a".repeat(64)}`;

for (const kind of ["collections", "contracts", "providers"] as const) {
    for (const count of [1, 256, 1_200]) {
        test(`${kind}: ${count} releases require only one HTTP request per catalogue page`, async () => {
            const requests: string[] = [];
            const entries = Array.from({ length: count }, (_, index) => catalogueEntry(kind, index));
            const server = Bun.serve({
                hostname: "127.0.0.1",
                port: 0,
                fetch(request) {
                    const url = new URL(request.url);
                    requests.push(url.pathname);
                    if (url.pathname !== `/v1/${kind}`) {
                        return new Response(null, { status: 500 });
                    }
                    const start = Number(url.searchParams.get("cursor") ?? 0);
                    const limit = Number(url.searchParams.get("limit"));
                    const next = start + limit;
                    return Response.json({
                        releases: entries.slice(start, next),
                        ...(next < entries.length ? { nextCursor: String(next) } : {}),
                    });
                },
            });
            try {
                const listed =
                    kind === "collections"
                        ? await new HttpCollectionRepository("official", server.url.href).list()
                        : await new HttpProviderRepository("official", server.url.href).list(
                              kind === "contracts" ? "contract" : "provider-manifest",
                          );
                expect(listed).toHaveLength(count);
                expect(requests).toHaveLength(Math.ceil(count / 256));
                expect(new Set(requests)).toEqual(new Set([`/v1/${kind}`]));
            } finally {
                await server.stop(true);
            }
        });
    }
}

test("collection bundle downloads have bounded asset concurrency and no duplicate asset requests", async () => {
    let active = 0;
    let maximum = 0;
    const requested: string[] = [];
    const assets = Array.from({ length: 12 }, (_, index) => ({
        id: `asset-${index}.txt`,
        mediaType: "text/plain",
        byteLength: 1,
        digest,
    }));
    const source = new HttpCollectionRepository("official", "https://repository.example", {
        request: async (url) => {
            const id = url.pathname.split("/assets/")[1];
            if (!id) {
                return Response.json({
                    kind: "collection",
                    protocol: "ulvia-collection/v1",
                    schemaDialect: "ulvia-schema/v1",
                    publisherId: "example.official",
                    collectionId: "example",
                    version: "1.0.0",
                    name: "name",
                    locale: "en",
                    translations: { en: { name: "Example" } },
                    assets,
                    blocs: [],
                });
            }
            requested.push(id);
            maximum = Math.max(maximum, ++active);
            await Bun.sleep(1);
            active--;
            return new Response("x");
        },
    });
    const bundle = await source.get({
        publisherId: "example.official",
        collectionId: "example",
        version: "1.0.0",
        digest,
    });
    expect(bundle.assets).toHaveLength(12);
    expect(maximum).toBe(4);
    expect(requested).toHaveLength(12);
    expect(new Set(requested).size).toBe(12);
});

function catalogueEntry(kind: "collections" | "contracts" | "providers", index: number) {
    const base = { publisherId: "example.official", version: `1.0.${index}`, digest, name: "Example" };
    if (kind !== "collections") {
        return { ...base, [kind === "contracts" ? "contractId" : "providerId"]: "example.catalogue" };
    }
    return {
        ...base,
        collectionId: "example",
        description: "Example collection",
        blocCount: 0,
        hasTheme: false,
        browserRisk: "none",
        browserRiskDigest: digest,
        javaScriptBlocCount: 0,
        frameBlocCount: 0,
        externalFrameOrigins: [],
        scriptsWithSameOrigin: false,
    };
}
