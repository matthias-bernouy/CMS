import { describe, expect, mock, test } from "bun:test";
import {
    InMemorySourceOverlayRepository,
    InMemorySourceRepository,
    SourceOverlaySourceRepository,
} from "@bernouy/cms-sources";

describe("SourceOverlaySourceRepository endpoint lookup", () => {
    test("materializes only overlays targeting the requested endpoint", async () => {
        const inner = new InMemorySourceRepository();
        const overlays = new InMemorySourceOverlayRepository();
        await inner.createSource({
            urn: "urn:accounts",
            endpoints: [
                {
                    urn: "urn:accounts:getAccount",
                    method: "GET",
                    targetUrl: "https://api.example.com/account",
                    output: [{ status: "200", body: { type: "object" } }],
                },
                {
                    urn: "urn:accounts:listAccounts",
                    method: "GET",
                    targetUrl: "https://api.example.com/accounts",
                    output: [{ status: "200", body: { type: "object" } }],
                },
                {
                    urn: "urn:accounts:getAccountFields",
                    method: "GET",
                    targetUrl: "https://api.example.com/account-fields",
                    headers: [
                        {
                            name: "Authorization",
                            source: { from: "secret", ref: "${ACCOUNT_FIELDS_KEY}" },
                        },
                    ],
                    output: [{ status: "200", body: { type: "object" } }],
                },
                {
                    urn: "urn:accounts:listAccountFields",
                    method: "GET",
                    targetUrl: "https://api.example.com/list-fields",
                    headers: [
                        {
                            name: "Authorization",
                            source: { from: "secret", ref: "${LIST_FIELDS_KEY}" },
                        },
                    ],
                    output: [{ status: "200", body: { type: "object" } }],
                },
            ],
        });
        await overlays.upsertOverlay({
            id: "account-fields",
            sourceId: "accounts",
            output: [{ endpointId: "getAccount" }],
            fieldSource: { endpointId: "getAccountFields" },
            fields: [],
        });
        await overlays.upsertOverlay({
            id: "account-list-fields",
            sourceId: "accounts",
            output: [{ endpointId: "listAccounts" }],
            fieldSource: { endpointId: "listAccountFields" },
            fields: [],
        });

        const fetchedUrls: string[] = [];
        const fetchImpl = mock(async (input: Parameters<typeof fetch>[0]) => {
            fetchedUrls.push(input instanceof Request ? input.url : String(input));
            return Response.json({
                fields: [{ id: "company", label: "Company", type: "string" }],
            });
        });
        const resolveSecret = mock(async () => "secret");
        const repository = new SourceOverlaySourceRepository(inner, overlays, {
            deps: { fetchImpl, resolveSecret },
        });

        const endpoint = await repository.getEndpoint("urn:accounts:getAccount");

        expect(fetchedUrls).toEqual(["https://api.example.com/account-fields"]);
        expect(resolveSecret).toHaveBeenCalledTimes(1);
        expect(endpoint?.output?.[0]?.body).toMatchObject({
            properties: {
                metadata: {
                    properties: { company: { type: "string" } },
                },
            },
        });
    });
});
