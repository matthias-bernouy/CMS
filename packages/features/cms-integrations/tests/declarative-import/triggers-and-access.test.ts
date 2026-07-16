import { describe, expect, test } from "bun:test";
import { importIntegration, parseIntegrationDefinition, type IntegrationDefinition } from "@bernouy/cms-integrations";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import { InMemoryRolesRepository, PUBLIC_ROLE, USER_ROLE } from "@bernouy/cms-permissions";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { InMemoryTriggerRepository } from "@bernouy/cms-triggers";

describe("@bernouy/cms-integrations declarative imports", () => {
    test("imports trigger artifacts and preserves enabled state on forced re-import", async () => {
        const sources = new InMemorySourceRepository();
        const functions = new InMemoryFunctionRepository();
        const triggers = new InMemoryTriggerRepository();
        const secrets = new InMemorySecretStore();
        const definition: IntegrationDefinition = {
            kind: "orders",
            label: "Orders",
            inputs: [],
            artifacts: [
                {
                    type: "source",
                    source: {
                        id: "orders",
                        meta: { name: "Orders" },
                        endpoints: [{
                            endpointId: "createOrder",
                            method: "POST",
                            targetUrl: "https://example.com/orders",
                            params: [],
                            output: [{ status: "200", body: { type: "object" } }],
                        }],
                    },
                },
                {
                    type: "function",
                    function: {
                        id: "notifyOrder",
                        method: "POST",
                        steps: [],
                        return: { status: 204 },
                    },
                },
                {
                    type: "trigger",
                    trigger: {
                        id: "notify-on-order",
                        label: "Notify on order",
                        event: { kind: "endpoint", source: "orders", endpoint: "createOrder", phase: "response" },
                        mode: "sync",
                        function: {
                            id: "notifyOrder",
                            body: { orderId: "$response.body.id" },
                        },
                    },
                },
            ],
        };

        const result = await importIntegration(
            { sources, functions, triggers, secrets },
            { kind: "orders", answers: {}, options: {} },
            [definition],
        );
        await triggers.setEnabled("notify-on-order", false);
        await triggers.recordRun("notify-on-order", { at: "2026-01-01T00:00:00.000Z", status: "error", error: "disabled test" });

        const rerun = await importIntegration(
            { sources, functions, triggers, secrets },
            { kind: "orders", answers: {}, options: { force: true } },
            [definition],
        );

        expect(result.artifacts).toEqual([
            { type: "source", id: "urn:orders", action: "created" },
            { type: "function", id: "notifyOrder", action: "created" },
            { type: "trigger", id: "notify-on-order", action: "created" },
        ]);
        expect(rerun.artifacts).toContainEqual({ type: "trigger", id: "notify-on-order", action: "updated" });
        expect(await triggers.getTrigger("notify-on-order")).toMatchObject({
            id: "notify-on-order",
            enabled: false,
            lastRun: { status: "error", error: "disabled test" },
        });
    });

    test("applies integration-declared public and auth endpoint grants", async () => {
        const sources = new InMemorySourceRepository();
        const functions = new InMemoryFunctionRepository();
        const roles = new InMemoryRolesRepository();
        const secrets = new InMemorySecretStore();
        const definition = parseIntegrationDefinition({
            kind: "shop",
            label: "Shop",
            inputs: [],
            artifacts: [
                {
                    type: "source",
                    source: {
                        id: "shop",
                        meta: { name: "Shop" },
                        endpoints: [
                            {
                                endpointId: "catalog",
                                method: "GET",
                                access: "public",
                                targetUrl: "https://example.com/catalog",
                                params: [],
                                output: [{ status: "200", body: { type: "object" } }],
                            },
                            {
                                endpointId: "myOrders",
                                method: "GET",
                                access: { mode: "auth" },
                                targetUrl: "https://example.com/orders/me",
                                params: [],
                                output: [{ status: "200", body: { type: "object" } }],
                            },
                            {
                                endpointId: "adminOrders",
                                method: "GET",
                                access: "admin",
                                targetUrl: "https://example.com/orders",
                                params: [],
                                output: [{ status: "200", body: { type: "object" } }],
                            },
                            {
                                endpointId: "createOrder",
                                method: "POST",
                                access: "system",
                                targetUrl: "https://example.com/orders",
                                params: [],
                                output: [{ status: "200", body: { type: "object" } }],
                            },
                        ],
                    },
                },
                {
                    type: "function",
                    function: {
                        id: "checkout",
                        method: "POST",
                        access: "public",
                        steps: [{ id: "catalog", call: { source: "shop", endpoint: "catalog" } }],
                        return: { body: { ok: true } },
                    },
                },
            ],
        });

        await importIntegration(
            { sources, functions, roles, secrets },
            { kind: "shop", answers: {}, options: {} },
            [definition],
        );

        expect((await roles.get(PUBLIC_ROLE))?.grants.map(grant => grant.permission).sort()).toEqual([
            "urn:shop:catalog",
            "urn:system-functions:checkout",
        ]);
        expect((await roles.get(USER_ROLE))?.grants.map(grant => grant.permission)).toEqual([
            "urn:shop:myOrders",
        ]);
    });
});
