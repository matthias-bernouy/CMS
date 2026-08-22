import { describe, expect, test } from "bun:test";
import {
    sourceDtoToSource,
    sourceToCanonicalDto,
    sourceToDto,
    sourceToFlatDto,
    type SourceDto,
} from "@bernouy/cms-sources";

describe("source DTO canonical views", () => {
    test("round-trips endpoint contracts and qualifies identity semantics", () => {
        const dto: SourceDto = {
            id: "accounts",
            identityAuthority: "crm-users",
            meta: { name: "Accounts", description: "CRM accounts" },
            endpoints: [
                {
                    endpointId: "update",
                    method: "PATCH",
                    targetUrl: "https://api.example.test/accounts/{id}",
                    timeoutMs: 2_000,
                    access: { mode: "auth" },
                    effects: { invalidatesSchema: true },
                    responseKind: "json",
                    mediaType: "application/json",
                    params: [
                        {
                            name: "id",
                            in: "path",
                            semantic: { kind: "user-id" },
                            required: true,
                            description: "Account owner",
                            source: { from: "request" },
                        },
                    ],
                    body: {
                        type: "object",
                        properties: {
                            owner: { type: "string", semantic: { kind: "user-id" } },
                        },
                    },
                    output: [
                        {
                            status: "200",
                            body: { type: "string", semantic: { kind: "user-id" } },
                            triggerBody: { type: "string", semantic: { kind: "user-id" } },
                        },
                    ],
                    meta: { name: "Update account" },
                    headers: [{ name: "x-api-key", source: { from: "secret", ref: "${CRM_API_KEY}" } }],
                },
            ],
        };

        const source = sourceDtoToSource(dto);
        const endpoint = source.endpoints[0];

        expect(source.urn).toBe("urn:accounts");
        expect(endpoint.urn).toBe("urn:accounts:update");
        expect(endpoint.input?.params?.[0]?.schema.semantic).toEqual({
            kind: "user-id",
            authority: "crm-users",
        });
        expect(endpoint.input?.body?.properties?.owner?.semantic?.authority).toBe("crm-users");
        expect(endpoint.output?.[0]?.body?.semantic?.authority).toBe("crm-users");
        expect(endpoint.output?.[0]?.triggerBody?.semantic?.authority).toBe("crm-users");

        const roundTrip = sourceToDto(source);
        expect(roundTrip.id).toBe("accounts");
        expect(roundTrip.identityAuthority).toBe("crm-users");
        expect(roundTrip.endpoints[0]).toMatchObject({
            endpointId: "update",
            method: "PATCH",
            timeoutMs: 2_000,
            responseKind: "json",
        });
    });

    test("provides stable flat and canonical defaults for editor consumers", () => {
        const source = sourceDtoToSource({
            id: "inventory",
            meta: { name: "Inventory" },
            endpoints: [
                {
                    endpointId: "list",
                    method: "GET",
                    targetUrl: "https://api.example.test/inventory",
                    params: [],
                },
            ],
        });

        expect(sourceToFlatDto(source)).toEqual({
            id: "inventory",
            "meta.name": "Inventory",
            "endpoints.0.endpointId": "list",
            "endpoints.0.method": "GET",
            "endpoints.0.targetUrl": "https://api.example.test/inventory",
        });
        expect(sourceToCanonicalDto(source)).toEqual({
            id: "inventory",
            meta: { name: "Inventory", description: "", icon: "", svg: "" },
            indexing: null,
            endpoints: [
                {
                    endpointId: "list",
                    method: "GET",
                    targetUrl: "https://api.example.test/inventory",
                    responseKind: "json",
                    mediaType: "",
                    params: [],
                    body: null,
                    output: null,
                    meta: null,
                    headers: null,
                },
            ],
        });
    });
});
