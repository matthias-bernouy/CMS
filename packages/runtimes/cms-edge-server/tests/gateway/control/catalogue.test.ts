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

test("1.5 targeted lookup sends only current actor and tool name, never a full installation listing", async () => {
    const actor = { kind: "administrator", subjectId: "admin", authorizationRevision: 7 } as const;
    const calls: unknown[] = [];
    const catalogue = new ControlMcpCatalogue(
        {
            invoke: async () => {
                throw new Error("Full catalogue must not be invoked");
            },
            resolveContract: async () => {
                throw new Error("No broad route listing");
            },
        },
        {
            supportsCompactCatalogue: true,
            resolveToolContract: async (...args: unknown[]) => {
                calls.push(args);
                return null;
            },
        } as unknown as ControlProviderClient,
    );
    await catalogue.resolve("selected_tool", { siteId: "default", actor });
    expect(calls).toEqual([[actor, "selected_tool"]]);
    await expect(
        catalogue.resolve("selected_tool", { siteId: "default", actor: { kind: "anonymous" } }),
    ).rejects.toThrow();
    await expect(catalogue.resolve("selected_tool", { siteId: "another-site", actor })).rejects.toThrow();
    expect(calls).toHaveLength(1);
});
