import { expect, test } from "bun:test";
import { CapabilityGateway } from "@bernouy/cms-gateway";
import { gatewayRoute, NOW } from "../fixtures";

test("a resource association fences target installation, endpoint and account before dispatch", async () => {
    const route = await gatewayRoute();
    const installed = route.installation.installation;
    const target = {
        installationId: installed.id,
        endpoint: installed.endpoint,
        accountId: installed.accountId,
        instanceId: route.installation.observation!.report.instanceId,
    };
    let dispatches = 0;
    const gateway = new CapabilityGateway({
        routes: { resolve: async () => route, isCurrent: async () => true },
        authorize: async () => true,
        now: () => NOW,
        transport: {
            send: async () => {
                dispatches++;
                return { status: 200, contentType: "application/json", output: { items: ["ok"] } };
            },
        },
    });
    const invocation = {
        siteId: "site-a",
        contractId: "ulvia/catalog",
        capabilityId: "item.list",
        actor: { kind: "anonymous" as const },
        input: {},
    };
    for (const expectedTarget of [
        { ...target, installationId: "foreign" },
        { ...target, endpoint: "https://foreign.test" },
        { ...target, accountId: "foreign" },
        { ...target, instanceId: "foreign" },
    ]) {
        await expect(gateway.invoke({ ...invocation, expectedTarget })).rejects.toMatchObject({ code: "stale_route" });
    }
    expect(dispatches).toBe(0);
    expect((await gateway.invoke({ ...invocation, expectedTarget: target })).kind).toBe("success");
    expect((await gateway.invoke(invocation)).kind).toBe("success");
    expect(dispatches).toBe(2);
});
