import { describe, test, expect } from "bun:test";
import { seedSources } from "cms-sources/core/system/seedSources";
import { InMemorySourceRepository } from "cms-sources/default-implementation/InMemorySourceRepository";
import type { Source } from "cms-sources/interfaces/Source";

// Sample manifest (no-auth, public) — also used as a fixture for developing
// the executor against a seeded repo.
const manifest: Source[] = [
    {
        urn: "urn:open-meteo",
        meta: { name: "Open-Meteo" },
        endpoints: [
            {
                urn: "urn:open-meteo:forecast",
                method: "GET",
                targetUrl: "https://api.open-meteo.com/v1/forecast",
                input: {
                    params: [
                        { name: "latitude", in: "query", required: true, schema: { type: "number" } },
                        { name: "longitude", in: "query", required: true, schema: { type: "number" } },
                    ],
                },
                output: [{ status: "200", body: { type: "object" } }],
            },
        ],
    },
    {
        urn: "urn:rest-countries",
        meta: { name: "REST Countries" },
        endpoints: [
            {
                urn: "urn:rest-countries:byName",
                method: "GET",
                targetUrl: "https://restcountries.com/v3.1/name",
                output: [{ status: "200", body: { type: "array", items: { type: "object" } } }],
            },
        ],
    },
];

describe("seedSources", () => {
    test("seeds a manifest", async () => {
        const repo = new InMemorySourceRepository();
        const res = await seedSources(repo, manifest);
        expect(res.created).toEqual(["urn:open-meteo", "urn:rest-countries"]);
        expect(res.skipped).toEqual([]);
        expect(await repo.getAllSources()).toHaveLength(2);
        expect((await repo.getEndpoint("urn:open-meteo:forecast"))?.targetUrl).toBe(
            "https://api.open-meteo.com/v1/forecast",
        );
    });

    test("is idempotent — a second run skips everything", async () => {
        const repo = new InMemorySourceRepository();
        await seedSources(repo, manifest);
        const res = await seedSources(repo, manifest);
        expect(res.created).toEqual([]);
        expect(res.skipped).toEqual(["urn:open-meteo", "urn:rest-countries"]);
        expect(await repo.getAllSources()).toHaveLength(2);
    });

    test("skips an already-present source, creates the rest", async () => {
        const repo = new InMemorySourceRepository();
        await repo.createSource(manifest[0]!);
        const res = await seedSources(repo, manifest);
        expect(res.created).toEqual(["urn:rest-countries"]);
        expect(res.skipped).toEqual(["urn:open-meteo"]);
    });

    test("throws on an invalid source and creates nothing (fail fast)", async () => {
        const repo = new InMemorySourceRepository();
        const bad: Source[] = [manifest[0]!, { urn: "bad-urn", endpoints: [] }];
        await expect(seedSources(repo, bad)).rejects.toThrow(/Invalid source manifest/);
        expect(await repo.getAllSources()).toHaveLength(0);
    });

    test("throws on duplicate urns in the manifest", async () => {
        const repo = new InMemorySourceRepository();
        await expect(seedSources(repo, [manifest[0]!, manifest[0]!])).rejects.toThrow(/duplicate source urns/);
    });
});
