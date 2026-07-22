import { describe, expect, test } from "bun:test";
import {
    applySourceOverlays,
    InMemorySourceOverlayRepository,
    InMemorySourceRepository,
    materializeSourceOverlays,
    SourceOverlaySourceRepository,
} from "@bernouy/cms-sources";
import { overlay, source } from "../helpers/sourceOverlayFixtures";

const sourceWithFieldEndpoint = {
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

describe("source overlay materialization", () => {
    test("materializes fields from a source endpoint", async () => {
        const inner = new InMemorySourceRepository();
        const overlays = new InMemorySourceOverlayRepository();
        await inner.createSource(sourceWithFieldEndpoint);
        await overlays.upsertOverlay({ ...overlay, fieldSource: { endpointId: "listExtraFields" }, fields: [] });

        const repository = new SourceOverlaySourceRepository(inner, overlays, {
            deps: {
                fetchImpl: async () => Response.json({ fields: [{ id: "company", label: "Company", type: "string" }] }),
            },
        });

        expect((await repository.getEndpoint("urn:user-account:getAccount"))?.output?.[0]?.body).toMatchObject({
            properties: { metadata: { properties: { company: { type: "string" } } } },
        });
    });

    test("passes static field-source params while materializing fields", async () => {
        const sourceWithParams = {
            ...sourceWithFieldEndpoint,
            endpoints: sourceWithFieldEndpoint.endpoints.map((endpoint) =>
                endpoint.urn.endsWith(":listExtraFields")
                    ? {
                          ...endpoint,
                          input: {
                              params: [
                                  {
                                      name: "entityType",
                                      in: "query" as const,
                                      schema: { type: "string" as const },
                                  },
                              ],
                          },
                      }
                    : endpoint,
            ),
        };
        let requestedUrl = "";
        const [materialized] = await materializeSourceOverlays(
            sourceWithParams,
            [
                {
                    ...overlay,
                    fieldSource: { endpointId: "listExtraFields", params: { entityType: "product" } },
                    fields: [],
                },
            ],
            {
                fetchImpl: async (request) => {
                    requestedUrl = String(request);
                    return Response.json({ fields: [{ id: "brand", label: "Brand", type: "string" }] });
                },
            },
        );

        expect(new URL(requestedUrl).searchParams.get("entityType")).toBe("product");
        expect(materialized?.fields[0]?.id).toBe("brand");
    });

    test("materializes mapped field options without changing the data shape", async () => {
        const [materialized] = await materializeSourceOverlays(
            sourceWithFieldEndpoint,
            [
                {
                    ...overlay,
                    fieldSource: { endpointId: "listExtraFields", map: { options: "choices" } },
                    fields: [],
                },
            ],
            {
                fetchImpl: async () =>
                    Response.json({
                        fields: [
                            {
                                id: "accountStatus",
                                label: "Account status",
                                type: "string",
                                choices: [
                                    { value: "pending", label: "Pending", subtitle: "Waiting for review" },
                                    { value: "active", label: "Active" },
                                ],
                            },
                        ],
                    }),
            },
        );
        expect(materialized?.fields[0]).toEqual({
            id: "accountStatus",
            label: "Account status",
            type: "string",
            options: [
                { value: "pending", label: "Pending", subtitle: "Waiting for review" },
                { value: "active", label: "Active" },
            ],
        });
        const output = applySourceOverlays(sourceWithFieldEndpoint, [materialized!]).endpoints.find((endpoint) =>
            endpoint.urn.endsWith(":getAccount"),
        )?.output?.[0]?.body;
        expect(output?.properties?.metadata?.properties?.accountStatus).toEqual({
            type: "string",
            title: "Account status",
        });
    });
});
