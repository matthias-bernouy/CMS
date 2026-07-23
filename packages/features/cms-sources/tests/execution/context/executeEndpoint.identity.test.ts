import { describe, expect, test } from "bun:test";
import { InMemoryIdentityService } from "@bernouy/cms-identities";
import { executeEndpoint, makeEndpointUrn } from "@bernouy/cms-sources";

describe("executeEndpoint identity bindings", () => {
    test("binds a qualified self identity from a successful JSON response", async () => {
        const identities = new InMemoryIdentityService();
        const response = await executeEndpoint(
            {
                urn: makeEndpointUrn("commerce", "mySeller"),
                method: "GET",
                targetUrl: "https://commerce.test/me",
                headers: [{ name: "x-cms-user-id", source: { from: "computed", ref: "userID" } }],
                effects: { identityBindings: [{ kind: "user", responsePath: "id" }] },
                output: [
                    {
                        status: "200",
                        body: {
                            type: "object",
                            properties: {
                                id: {
                                    type: "number",
                                    semantic: { kind: "user-id", authority: "commerce" },
                                },
                            },
                        },
                    },
                ],
            },
            new Request("https://cms.test/internal"),
            {
                identities,
                resolveContext: async () => ({ userID: "subject-seller" }),
                fetchImpl: async () => Response.json({ id: 184 }),
            },
        );

        expect(response.status).toBe(200);
        expect(await identities.resolve({ authority: "commerce", kind: "user", value: 184 }, "cms")).toBe(
            "subject-seller",
        );
    });

    test("resolves the caller context when identity binding is the only context consumer", async () => {
        const identities = new InMemoryIdentityService();
        const response = await executeEndpoint(
            {
                urn: makeEndpointUrn("commerce", "identityOnly"),
                method: "GET",
                targetUrl: "https://commerce.test/identity",
                effects: { identityBindings: [{ kind: "user", responsePath: "id" }] },
                output: [
                    {
                        status: "200",
                        body: {
                            type: "object",
                            properties: {
                                id: {
                                    type: "number",
                                    semantic: { kind: "user-id", authority: "commerce" },
                                },
                            },
                        },
                    },
                ],
            },
            new Request("https://cms.test/internal"),
            {
                identities,
                resolveContext: async () => ({ userID: "subject-buyer" }),
                fetchImpl: async () => Response.json({ id: 42 }),
            },
        );

        expect(response.status).toBe(200);
        expect(await identities.resolve({ authority: "commerce", kind: "user", value: 42 }, "cms")).toBe(
            "subject-buyer",
        );
    });

    test("rejects a mutating identity-binding endpoint before invoking upstream when identities are unavailable", async () => {
        let upstreamCalls = 0;
        const response = await executeEndpoint(
            {
                urn: makeEndpointUrn("commerce", "registerMySeller"),
                method: "POST",
                targetUrl: "https://commerce.test/me/seller",
                effects: { identityBindings: [{ kind: "user", responsePath: "id" }] },
                output: [
                    {
                        status: "200",
                        body: {
                            type: "object",
                            properties: {
                                id: {
                                    type: "number",
                                    semantic: { kind: "user-id", authority: "commerce" },
                                },
                            },
                        },
                    },
                ],
            },
            new Request("https://cms.test/internal", { method: "POST" }),
            {
                resolveContext: async () => ({ userID: "subject-seller" }),
                fetchImpl: async () => {
                    upstreamCalls += 1;
                    return Response.json({ id: 184 });
                },
            },
        );

        expect(response.status).toBe(500);
        expect(await response.text()).toBe("identity service not configured");
        expect(upstreamCalls).toBe(0);
    });
});
