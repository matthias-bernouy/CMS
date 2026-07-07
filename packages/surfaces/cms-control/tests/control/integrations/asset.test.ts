import { describe, expect, test } from "bun:test";
import getIntegrationAsset from "cms-control/api/integrations/asset.get";
import type { IntegrationDefinitionRepository } from "@bernouy/cms-integrations";

describe("GET /api/integrations/asset", () => {
    test("proxies integration assets through Control", async () => {
        const calls: string[] = [];
        const integrationCatalog: IntegrationDefinitionRepository = {
            list: async () => [],
            getIndex: async () => null,
            listVersions: async () => [],
            get: async () => null,
            getAsset: async (kind, version, path) => {
                calls.push(`${kind}:${version ?? "default"}:${path}`);
                return {
                    bytes: new TextEncoder().encode("<svg></svg>"),
                    contentType: "image/svg+xml",
                };
            },
        };

        const res = await getIntegrationAsset(
            new Request("http://localhost/api/integrations/asset?kind=demo&version=1.0.0&path=assets%2Ficon.svg"),
            { integrationCatalog } as any,
        );

        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("image/svg+xml");
        expect(await res.text()).toBe("<svg></svg>");
        expect(calls).toEqual(["demo:1.0.0:assets/icon.svg"]);
    });

    test("returns 404 for missing integration assets", async () => {
        const integrationCatalog: IntegrationDefinitionRepository = {
            list: async () => [],
            getIndex: async () => null,
            listVersions: async () => [],
            get: async () => null,
            getAsset: async () => null,
        };

        const res = await getIntegrationAsset(
            new Request("http://localhost/api/integrations/asset?kind=demo&path=assets%2Fmissing.svg"),
            { integrationCatalog } as any,
        );

        expect(res.status).toBe(404);
    });
});
