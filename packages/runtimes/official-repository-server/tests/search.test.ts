import { HttpRepositoryDiscovery } from "@bernouy/cms-repository/repository/search/http";
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { admitCollectionRelease } from "@bernouy/cms-repository/collections";
import { LocalCollectionRepository } from "@bernouy/cms-repository/repository/filesystem";
import { RepositoryDiscovery } from "@bernouy/cms-repository/repository/search";
import { createOfficialRepositoryApplication } from "../src/application";

async function fixture() {
    const root = await mkdtemp(join(tmpdir(), "repository-discovery-http-"));
    const artifact = await admitCollectionRelease({
        kind: "collection",
        protocol: "ulvia-collection/v1",
        schemaDialect: "ulvia-schema/v1",
        publisherId: "example.official",
        collectionId: "shop",
        version: "1.0.0",
        name: "name",
        description: "description",
        locale: "en",
        translations: { en: { name: "Shop", description: "Product card with price 😀" } },
        assets: [],
        blocs: [],
    });
    await new LocalCollectionRepository(root).store(artifact);
    const application = await createOfficialRepositoryApplication(root);
    const requests: string[] = [];
    const source = new HttpRepositoryDiscovery("configured", "https://repository.test", {
        request: async (url, init) => {
            requests.push(`${init.method ?? "GET"} ${url.pathname}`);
            return application.handle(new Request(url, init));
        },
    });
    return { root, artifact, application, requests, source, discovery: new RepositoryDiscovery([source]) };
}

test("HTTP search and exact metadata inspection work before installation through the admitted contract", async () => {
    const f = await fixture();
    try {
        const found = await f.discovery.search({ query: "product", kinds: ["collection"] });
        expect(found).toMatchObject({ mode: "lexical", partial: false });
        const result = found.results[0]!;
        expect(result).toMatchObject({
            repositoryId: "configured",
            reference: { id: "shop", digest: f.artifact.digest },
        });
        let content = "";
        let offset = 0;
        for (;;) {
            const part = await f.discovery.get({
                repositoryId: result.repositoryId,
                reference: result.reference,
                offset,
                limit: 200,
            });
            content += part.content;
            if (part.nextOffset === undefined) {
                break;
            }
            offset = part.nextOffset;
        }
        expect(JSON.parse(content).collectionId).toBe("shop");
        expect(content).toContain("😀");
        expect(f.requests).toHaveLength(2);
        expect(f.requests[0]).toBe("QUERY /v1/search");
        expect(
            f.requests
                .slice(1)
                .every((request) => request === "GET /v1/releases/collection/example.official/shop/1.0.0"),
        ).toBe(true);
        await expect(
            f.discovery.get({ repositoryId: result.repositoryId, reference: { ...result.reference, id: "missing" } }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(
            f.discovery.get({
                repositoryId: "configured",
                reference: { ...result.reference, digest: `sha256:${"0".repeat(64)}` },
            }),
        ).rejects.toThrow();
        await expect(
            f.discovery.get({ repositoryId: "configured", reference: { ...result.reference, id: "../private" } }),
        ).rejects.toThrow();
        const invalid = await f.application.handle(
            new Request("https://repository.test/v1/search", {
                method: "QUERY",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: "product", url: "https://attacker.test" }),
            }),
        );
        expect(invalid.status).toBeGreaterThanOrEqual(400);
    } finally {
        await f.application.close();
        await rm(f.root, { recursive: true, force: true });
    }
});

test("remote malformed discovery pages are reported as unavailable without leaking untrusted fields", async () => {
    let cancelled = false;
    const failed = new HttpRepositoryDiscovery("failed", "https://repository.test", {
        request: async () =>
            new Response(
                new ReadableStream({
                    cancel() {
                        cancelled = true;
                    },
                }),
                { status: 503 },
            ),
    });
    const malformed = new HttpRepositoryDiscovery("malformed", "https://repository.test", {
        request: async () => Response.json({ results: [], secret: "untrusted" }),
    });
    const result = await new RepositoryDiscovery([failed, malformed]).search({ query: "product" });
    expect(result).toMatchObject({ partial: true, unavailableRepositories: ["failed", "malformed"], results: [] });
    expect(cancelled).toBe(true);
    expect(JSON.stringify(result)).not.toContain("untrusted");
});
