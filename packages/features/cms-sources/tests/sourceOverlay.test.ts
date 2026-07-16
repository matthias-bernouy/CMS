import { describe, expect, test } from "bun:test";
import {
    applySourceOverlays,
    InMemorySourceOverlayRepository,
    InMemorySourceRepository,
    materializeSourceOverlays,
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

    test("represents multiple overlay fields as arrays in direct and list outputs", () => {
        const enriched = applySourceOverlays(source, [{
            ...overlay,
            fields: [{ id: "company", label: "Company", type: "string", multiple: true }],
        }]);
        const getAccount = enriched.endpoints.find(endpoint => endpoint.urn.endsWith(":getAccount"))!;
        const listAccounts = enriched.endpoints.find(endpoint => endpoint.urn.endsWith(":listAccounts"))!;

        const expected = {
            type: "array",
            items: { type: "string" },
            title: "Company",
        };
        expect(getAccount.output?.[0]?.body?.properties?.metadata?.properties?.company).toEqual(expected);
        expect(listAccounts.output?.[0]?.body?.properties?.accounts?.items
            ?.properties?.metadata?.properties?.company).toEqual(expected);
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

    test("passes static field-source params while materializing fields", async () => {
        const sourceWithFields = {
            ...source,
            endpoints: [
                ...source.endpoints,
                {
                    urn: "urn:user-account:listExtraFields",
                    method: "GET" as const,
                    targetUrl: "https://api.example.com/fields",
                    input: {
                        params: [{ name: "entityType", in: "query" as const, schema: { type: "string" as const } }],
                    },
                    output: [{ status: "200", body: { type: "object" as const } }],
                },
            ],
        };
        let requestedUrl = "";
        const [materialized] = await materializeSourceOverlays(sourceWithFields, [{
            ...overlay,
            fieldSource: {
                endpointId: "listExtraFields",
                params: { entityType: "product" },
            },
            fields: [],
        }], {
            fetchImpl: async request => {
                requestedUrl = String(request);
                return Response.json({ fields: [{ id: "brand", label: "Brand", type: "string" }] });
            },
        });

        expect(new URL(requestedUrl).searchParams.get("entityType")).toBe("product");
        expect(materialized?.fields[0]?.id).toBe("brand");
    });

    test("materializes mapped field options without changing the data shape", async () => {
        const sourceWithFields = {
            ...source,
            endpoints: [
                ...source.endpoints,
                {
                    urn: "urn:user-account:listExtraFields",
                    method: "GET" as const,
                    targetUrl: "https://api.example.com/fields",
                    output: [{ status: "200", body: { type: "object" as const } }],
                },
            ],
        };
        const [materialized] = await materializeSourceOverlays(sourceWithFields, [{
            ...overlay,
            fieldSource: { endpointId: "listExtraFields", map: { options: "choices" } },
            fields: [],
        }], {
            fetchImpl: async () => Response.json({
                fields: [{
                    id: "accountStatus",
                    label: "Account status",
                    type: "string",
                    choices: [
                        { value: "pending", label: "Pending", subtitle: "Waiting for review" },
                        { value: "active", label: "Active" },
                    ],
                }],
            }),
        });
        expect(materialized?.fields).toEqual([{
            id: "accountStatus",
            label: "Account status",
            type: "string",
            options: [
                { value: "pending", label: "Pending", subtitle: "Waiting for review" },
                { value: "active", label: "Active" },
            ],
        }]);
        const outputShape = applySourceOverlays(sourceWithFields, [materialized!])
            .endpoints.find(endpoint => endpoint.urn.endsWith(":getAccount"))
            ?.output?.[0]?.body;
        expect(outputShape?.properties?.metadata?.properties?.accountStatus).toEqual({
            type: "string",
            title: "Account status",
        });
    });
});
