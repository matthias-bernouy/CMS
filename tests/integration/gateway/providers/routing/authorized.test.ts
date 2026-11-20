import { expect, test } from "bun:test";
import { executeCapability } from "@bernouy/ulvia-sdk/local";
import { installationsFeature } from "@bernouy/repository/features/installations";
import type { InstallationServices } from "@bernouy/repository/features/installations";
import { capabilityToolName } from "@bernouy/cms-gateway/mcp";
import { gatewayRoute } from "../../fixtures";

test("compact MCP resolution reauthorizes before every lookup, never lists installations and cannot retain a rejected actor", async () => {
    const route = await gatewayRoute({ mcp: true });
    const events: string[] = [];
    let revoked = false;
    const actor = { kind: "administrator", subjectId: "admin", authorizationRevision: 7 };
    const gateway = {
        siteId: "site-a",
        catalogueRevision: async () => "1",
        authorizeMcpCatalogue: async (value: unknown) => {
            events.push("authorize");
            expect(value).toEqual(actor);
            if (revoked) {
                throw Object.assign(new Error("revoked"), { status: 403 });
            }
        },
        selections: {
            get: async (site: string) => {
                expect(site).toBe("site-a");
                events.push("selected");
                return { plan: { selections: [{ contractId: "ulvia/catalog" }] } };
            },
        },
        installations: {
            list: async () => {
                throw new Error("Full installation listing is forbidden");
            },
        },
        routes: {
            resolve: async (site: string, id: string) => {
                expect(site).toBe("site-a");
                expect(id).toBe("ulvia/catalog");
                events.push("route");
                return route;
            },
        },
    };
    const call = () =>
        executeCapability(installationsFeature, "gateway.mcp.authorized", {
            input: { actor, toolName: capabilityToolName("ulvia/catalog", "item.list", "mcp"), known: [] },
            services: { gateway } as unknown as InstallationServices,
            context: {
                requestId: "compact-test",
                siteId: "site-a",
                contractVersion: "1.6.0",
                providerId: "ulvia/provider",
                controlAuthority: true,
            },
        });
    expect((await call()).found).toBe(true);
    expect((await call()).found).toBe(true);
    revoked = true;
    await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(events).toEqual(["authorize", "selected", "route", "authorize", "selected", "route", "authorize"]);
    revoked = false;
    expect((await call()).found).toBe(true);
});
