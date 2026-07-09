import { describe, expect, test } from "bun:test";
import {
    applySourceOverlays,
    InMemorySourceOverlayRepository,
    InMemorySourceRepository,
    SourceOverlaySourceRepository,
} from "@bernouy/cms-sources";
import { overlay, source } from "./helpers/sourceOverlayFixtures";

describe("source overlays", () => {
    test("adds extra fields to input and output endpoint shapes", () => {
        const enriched = applySourceOverlays(source, [overlay]);
        const getAccount = enriched.endpoints.find(endpoint => endpoint.urn.endsWith(":getAccount"))!;
        const listAccounts = enriched.endpoints.find(endpoint => endpoint.urn.endsWith(":listAccounts"))!;
        const updateAccount = enriched.endpoints.find(endpoint => endpoint.urn.endsWith(":updateAccount"))!;

        expect(getAccount.output?.[0]?.body).toMatchObject({
            properties: {
                metadata: {
                    properties: {
                        company: { type: "string" },
                        employeeCount: { type: "number" },
                    },
                },
            },
        });
        expect(listAccounts.output?.[0]?.body).toMatchObject({
            properties: {
                accounts: {
                    items: {
                        properties: {
                            metadata: {
                                properties: {
                                    company: { type: "string" },
                                },
                            },
                        },
                    },
                },
            },
        });
        expect(updateAccount.input?.body).toMatchObject({
            properties: {
                metadata: {
                    properties: {
                        employeeCount: { type: "number" },
                    },
                },
            },
        });
    });

    test("wraps a source repository without changing writes", async () => {
        const inner = new InMemorySourceRepository();
        const overlays = new InMemorySourceOverlayRepository();
        await inner.createSource(source);
        await overlays.upsertOverlay(overlay);

        const repo = new SourceOverlaySourceRepository(inner, overlays);

        expect((await inner.getSource("urn:user-account"))?.endpoints[0]?.output?.[0]?.body).not.toMatchObject({
            properties: { metadata: {} },
        });
        expect((await repo.getEndpoint("urn:user-account:getAccount"))?.output?.[0]?.body).toMatchObject({
            properties: {
                metadata: {
                    properties: {
                        company: { type: "string" },
                    },
                },
            },
        });
    });

    test("materializes fields from a source endpoint", async () => {
        const inner = new InMemorySourceRepository();
        const overlays = new InMemorySourceOverlayRepository();
        await inner.createSource({
            ...source,
            endpoints: [
                ...source.endpoints,
                {
                    urn: "urn:user-account:listExtraFields",
                    method: "GET",
                    targetUrl: "https://api.example.com/fields",
                    output: [{ status: "200", body: { type: "object" } }],
                },
            ],
        });
        await overlays.upsertOverlay({ ...overlay, fieldSource: { endpointId: "listExtraFields" }, fields: [] });

        const repo = new SourceOverlaySourceRepository(inner, overlays, {
            deps: {
                fetchImpl: async () => new Response(JSON.stringify({
                    fields: [{ id: "company", label: "Company", type: "string" }],
                }), { headers: { "content-type": "application/json" } }),
            },
        });

        expect((await repo.getEndpoint("urn:user-account:getAccount"))?.output?.[0]?.body).toMatchObject({
            properties: { metadata: { properties: { company: { type: "string" } } } },
        });
    });
});
