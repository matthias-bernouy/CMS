import { describe, expect, test } from "bun:test";
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import {
    InMemorySourceOverlayRepository,
    InMemorySourceRepository,
    SourceOverlaySourceRepository,
} from "@bernouy/cms-sources";
import listDashboards from "cms-control/api/dashboards.get";

describe("GET /api/dashboards dynamic overlay schema contract", () => {
    test("preserves the payload across the two current schema materializations", async () => {
        const sources = new InMemorySourceRepository();
        const overlays = new InMemorySourceOverlayRepository();
        const dashboards = new InMemoryDashboardRepository();
        let fieldSourceCalls = 0;
        const fetchImpl: typeof fetch = Object.assign(async () => {
            fieldSourceCalls += 1;
            return Response.json({
                fields: [{ id: "company", label: "Company", type: "string" }],
            });
        }, { preconnect: fetch.preconnect });

        await sources.createSource({
            urn: "urn:accounts",
            endpoints: [{
                urn: "urn:accounts:getAccount",
                method: "GET",
                targetUrl: "https://api.example.com/account",
                output: [{ status: "200", body: { type: "object" } }],
            }, {
                urn: "urn:accounts:listFields",
                method: "GET",
                targetUrl: "https://api.example.com/fields",
                output: [{ status: "200", body: { type: "object" } }],
            }],
        });
        await overlays.upsertOverlay({
            id: "account-fields",
            sourceId: "accounts",
            output: [{ endpointId: "getAccount" }],
            fieldSource: { endpointId: "listFields" },
            fields: [],
        });
        const overlaySources = new SourceOverlaySourceRepository(sources, overlays, {
            deps: { fetchImpl },
        });

        const response = await listDashboards(
            new Request("http://localhost/cms/api/dashboards"),
            {
                sources: overlaySources,
                dashboards,
                sourceOverlays: overlays,
                sourceExecutorDeps: { fetchImpl },
            } as any,
        );
        const body = await response.json() as any[];

        expect(body[0].sourceOverlays[0].fields).toEqual([
            { id: "company", label: "Company", type: "string" },
        ]);
        expect(body[0].endpoints[0].output[0].body).toMatchObject({
            properties: {
                metadata: {
                    properties: { company: { type: "string", title: "Company" } },
                },
            },
        });
        expect(fieldSourceCalls).toBe(2);
    });
});
