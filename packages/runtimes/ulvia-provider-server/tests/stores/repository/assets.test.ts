import { expect, test } from "bun:test";
import { DatabaseFixture } from "./database";
import { join } from "node:path";
import { HttpCollectionRepository } from "@bernouy/cms-repository/collections/http";
import { RemoteRepositoryClient } from "@bernouy/cms-repository/repository/publication";
import { createCollectionAuthoring } from "../../../src/runtime/stores/repository/composition";
import { authoringFixture, sourceSnapshot } from "../../../../official-repository-server/tests/authoring/fixture";

test("collection source assets validate their pinned bytes and remain usable after yank", async () => {
    const f = await authoringFixture();
    try {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="1" height="1"/></svg>';
        const original = JSON.parse(sourceSnapshot());
        original.files.push({ path: "assets/logo.svg", content: svg });
        const published = await f.authoring.prepare(JSON.stringify(original));
        await f.authoring.publish(published.preparationId, published.digest);
        const next = JSON.parse(sourceSnapshot("1.1.0"));
        next.assets = [
            {
                path: "assets/logo.svg",
                publisherId: "community",
                collectionId: "sample",
                version: "1.0.0",
                releaseDigest: published.digest,
                assetId: "logo.svg",
            },
        ];
        const stores = { releases: f.contracts, db: new DatabaseFixture(), contractSecrets: { repository: {} } };
        for (const tamper of ["asset", "release"]) {
            const source = new HttpCollectionRepository("local", f.base, {
                request: async (url, init) => {
                    const response = await fetch(url, init);
                    if (tamper === "asset" && url.pathname.endsWith("/assets/logo.svg")) {
                        await response.body?.cancel();
                        return new Response(svg.replace('width="1"', 'width="2"'), { headers: response.headers });
                    }
                    if (tamper === "release" && url.pathname.endsWith("/1.0.0")) {
                        const value = (await response.json()) as any;
                        value.version = "1.0.1";
                        return Response.json(value);
                    }
                    return response;
                },
            });
            const authoring = createCollectionAuthoring(stores as any, join(f.root, tamper), f.base, source, {} as any);
            await expect(authoring.prepare(JSON.stringify(next))).rejects.toThrow("digest");
        }
        const source = new HttpCollectionRepository("local", f.base);
        const authoring = createCollectionAuthoring(stores as any, join(f.root, "valid"), f.base, source, {} as any);
        expect((await authoring.prepare(JSON.stringify(next))).digest).toBeString();
        await new RemoteRepositoryClient(f.base, f.credential).yank(
            { kind: "collection", publisherId: "community", id: "sample", version: "1.0.0" },
            "superseded",
        );
        expect(await source.list()).toEqual([]);
        expect((await authoring.prepare(JSON.stringify(next))).digest).toBeString();
    } finally {
        await f.close();
    }
});
