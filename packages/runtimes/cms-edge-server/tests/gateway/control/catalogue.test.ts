import { expect, test } from "bun:test";
import { ControlMcpCatalogue } from "../../../src/runtime/gateway/control/catalogue";
import type { ControlProviderClient } from "../../../src/runtime/gateway/ControlProviderClient";
import type { GatewayInvocation } from "@bernouy/cms-gateway";
import { gatewayRoute } from "../../../../../../tests/integration/gateway/fixtures";

test("every targeted call obtains its selected IDs through the actor's Gateway before trusted control lookup", async () => {
    const route = await gatewayRoute();
    const calls: GatewayInvocation[] = [];
    let denied = false;
    const events: string[] = [];
    const gateway = {
        invoke: async (invocation: GatewayInvocation) => {
            calls.push(invocation);
            events.push("gateway");
            if (denied) {
                throw new Error("refused");
            }
            return {
                kind: "success" as const,
                requestId: "catalogue",
                output: { selections: [{ contractId: "ulvia/catalog" }, { contractId: "ulvia/catalog" }] },
            };
        },
        resolveContract: async () => route.requestedRelease.admission,
    };
    const control = {
        resolveToolContract: async (ids: string[], name: string) => {
            events.push("control");
            expect(ids).toEqual(["ulvia/catalog"]);
            expect(name).toBe("requested-tool");
            return route.requestedRelease.admission;
        },
    } as unknown as ControlProviderClient;
    const catalogue = new ControlMcpCatalogue(gateway, control);
    const scope = { siteId: "site-a", actor: { kind: "user" as const, subjectId: "user-a", authorizationRevision: 2 } };
    await catalogue.resolve("requested-tool", scope);
    await catalogue.resolve("requested-tool", scope);
    expect(calls).toEqual(
        [0, 1].map(() => ({
            ...scope,
            contractId: "ulvia/cms.installations",
            capabilityId: "list-provider-installations",
            input: {},
        })),
    );
    expect(events).toEqual(["gateway", "control", "gateway", "control"]);
    denied = true;
    await expect(catalogue.resolve("requested-tool", scope)).rejects.toThrow("refused");
    expect(events.at(-1)).toBe("gateway");
});
