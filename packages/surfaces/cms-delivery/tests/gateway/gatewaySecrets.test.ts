import { describe, expect, spyOn, test } from "bun:test";
import { InMemoryRolesRepository, USER_ROLE } from "@bernouy/cms-permissions";
import { COMPUTED, gatewayRoles, mountDeliveryGateway, publicGatewayRoles } from "./support/gatewayHarness";

describe("Delivery gateway secrets", () => {
    test("denies gateway execution when roles are not wired", async () => {
        const handler = await mountDeliveryGateway();
        const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("upstream"));
        try {
            const res = await handler(new Request("http://site/.cms/sources/secured/get"));

            expect(res.status).toBe(403);
            expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
            fetchSpy.mockRestore();
        }
    });

    test("returns 401 when an anonymous visitor lacks a source endpoint grant", async () => {
        const handler = await mountDeliveryGateway({ roles: new InMemoryRolesRepository() });
        const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("upstream"));
        try {
            const res = await handler(new Request("http://site/.cms/sources/secured/get"));

            expect(res.status).toBe(401);
            expect(await res.text()).toBe("Unauthorized");
            expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
            fetchSpy.mockRestore();
        }
    });

    test("keeps secret headers blocked by default", async () => {
        const handler = await mountDeliveryGateway({ roles: await publicGatewayRoles() });
        const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("upstream"));
        try {
            const res = await handler(new Request("http://site/.cms/sources/secured/get"));

            expect(res.status).toBe(500);
            expect(await res.text()).toBe(
                "secret header requires a configured secret store (not wired yet): authorization",
            );
            expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
            fetchSpy.mockRestore();
        }
    });

    test("uses an explicitly wired resolver for dev gateway secrets", async () => {
        const handler = await mountDeliveryGateway({
            resolveSecret: async (ref) => (ref === "${API_KEY}" ? "dev-key" : undefined),
            roles: await publicGatewayRoles(),
        });
        const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
        try {
            const res = await handler(new Request("http://site/.cms/sources/secured/get"));

            expect(res.status).toBe(200);
            const init = fetchSpy.mock.calls[0]![1] as RequestInit;
            expect((init.headers as Headers).get("authorization")).toBe("Bearer dev-key");
        } finally {
            fetchSpy.mockRestore();
        }
    });

    test("authenticated users inherit public source endpoint grants", async () => {
        const handler = await mountDeliveryGateway({
            providers: [COMPUTED],
            roles: await publicGatewayRoles("urn:computed:me"),
            auth: {
                local: {
                    getSubject: async () => ({ identifier: "user-123", role: USER_ROLE, displayName: "Ada" }),
                },
            },
        });
        const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
        try {
            const res = await handler(new Request("http://site/.cms/sources/computed/me"));

            expect(res.status).toBe(200);
            expect(fetchSpy.mock.calls[0]![0]).toBe("https://api.example.com/me?user_id=user-123&user_role=user");
        } finally {
            fetchSpy.mockRestore();
        }
    });

    test("resolves computed user identity and role from the Delivery auth subject", async () => {
        const handler = await mountDeliveryGateway({
            providers: [COMPUTED],
            roles: await gatewayRoles(USER_ROLE, "urn:computed:me"),
            auth: {
                local: {
                    getSubject: async () => ({ identifier: "user-123", role: USER_ROLE, displayName: "Ada" }),
                },
            },
        });
        const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
        try {
            const res = await handler(new Request("http://site/.cms/sources/computed/me"));

            expect(res.status).toBe(200);
            expect(fetchSpy.mock.calls[0]![0]).toBe("https://api.example.com/me?user_id=user-123&user_role=user");
        } finally {
            fetchSpy.mockRestore();
        }
    });
});
