import { describe, test, expect } from "bun:test";
import { seedProviders } from "cms-gateway/core/seedProviders";
import { InMemoryGatewayRepository } from "cms-gateway/default-implementation/InMemoryGatewayRepository";
import type { Provider } from "cms-gateway/interfaces/Gateway";

// Sample manifest (no-auth, public) — also used as a fixture for developing
// the executor against a seeded repo.
const manifest: Provider[] = [
    {
        urn: "urn:open-meteo",
        meta: { name: "Open-Meteo" },
        endpoints: [
            {
                urn: "urn:open-meteo:forecast",
                method: "GET",
                targetUrl: "https://api.open-meteo.com/v1/forecast",
                input: { params: [
                    { name: "latitude",  in: "query", required: true, schema: { type: "number" } },
                    { name: "longitude", in: "query", required: true, schema: { type: "number" } },
                ] },
            },
        ],
    },
    {
        urn: "urn:rest-countries",
        meta: { name: "REST Countries" },
        endpoints: [
            { urn: "urn:rest-countries:byName", method: "GET", targetUrl: "https://restcountries.com/v3.1/name" },
        ],
    },
];

describe("seedProviders", () => {
    test("seeds a manifest", async () => {
        const repo = new InMemoryGatewayRepository();
        const res = await seedProviders(repo, manifest);
        expect(res.created).toEqual(["urn:open-meteo", "urn:rest-countries"]);
        expect(res.skipped).toEqual([]);
        expect(await repo.getAllProviders()).toHaveLength(2);
        expect((await repo.getEndpoint("urn:open-meteo:forecast"))?.targetUrl)
            .toBe("https://api.open-meteo.com/v1/forecast");
    });

    test("is idempotent — a second run skips everything", async () => {
        const repo = new InMemoryGatewayRepository();
        await seedProviders(repo, manifest);
        const res = await seedProviders(repo, manifest);
        expect(res.created).toEqual([]);
        expect(res.skipped).toEqual(["urn:open-meteo", "urn:rest-countries"]);
        expect(await repo.getAllProviders()).toHaveLength(2);
    });

    test("skips an already-present provider, creates the rest", async () => {
        const repo = new InMemoryGatewayRepository();
        await repo.createProvider(manifest[0]!);
        const res = await seedProviders(repo, manifest);
        expect(res.created).toEqual(["urn:rest-countries"]);
        expect(res.skipped).toEqual(["urn:open-meteo"]);
    });

    test("throws on an invalid provider and creates nothing (fail fast)", async () => {
        const repo = new InMemoryGatewayRepository();
        const bad: Provider[] = [manifest[0]!, { urn: "bad-urn", endpoints: [] }];
        await expect(seedProviders(repo, bad)).rejects.toThrow(/Invalid provider manifest/);
        expect(await repo.getAllProviders()).toHaveLength(0);
    });

    test("throws on duplicate urns in the manifest", async () => {
        const repo = new InMemoryGatewayRepository();
        await expect(seedProviders(repo, [manifest[0]!, manifest[0]!])).rejects.toThrow(/duplicate provider urns/);
    });
});
