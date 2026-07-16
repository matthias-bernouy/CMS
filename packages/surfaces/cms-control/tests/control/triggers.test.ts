import { describe, expect, test } from "bun:test";
import { InMemoryTriggerRepository } from "@bernouy/cms-triggers";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import { InMemorySourceRepository, makeEndpointUrn, makeSourceUrn } from "@bernouy/cms-sources";
import createTrigger from "cms-control/api/triggers/create.post";
import listTriggers from "cms-control/api/triggers/triggers.get";
import setTriggerEnabled from "cms-control/api/triggers/enabled.post";

describe("triggers API", () => {
    test("creates a trigger only when its endpoint and function exist", async () => {
        const triggers = new InMemoryTriggerRepository();
        const functions = new InMemoryFunctionRepository();
        const sources = new InMemorySourceRepository();
        await functions.createFunction({
            id: "notifyOrder",
            method: "POST",
            steps: [],
            return: { status: 204 },
        });
        await sources.createSource({
            urn: makeSourceUrn("orders"),
            meta: { name: "Orders" },
            endpoints: [{
                urn: makeEndpointUrn("orders", "createOrder"),
                method: "POST",
                targetUrl: "https://orders.test",
            }],
        });

        const response = await createTrigger(new Request("http://localhost/cms/api/triggers/create", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                enabled: true,
                definition: {
                    id: "notify-on-order",
                    event: { kind: "endpoint", source: "orders", endpoint: "createOrder", phase: "response" },
                    condition: { equals: ["$response.status", 201] },
                    function: { id: "notifyOrder", body: "$response.body" },
                },
            }),
        }), { triggers, functions, sources } as any);

        expect(response.status).toBe(201);
        expect(await response.json()).toMatchObject({ id: "notify-on-order", enabled: true });
    });

    test("rejects response references in request-phase triggers", async () => {
        const triggers = new InMemoryTriggerRepository();
        const functions = new InMemoryFunctionRepository();
        const sources = new InMemorySourceRepository();
        await functions.createFunction({ id: "notifyOrder", method: "POST", steps: [], return: {} });

        expect(createTrigger(new Request("http://localhost/cms/api/triggers/create", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                definition: {
                    id: "invalid-request-trigger",
                    event: { kind: "endpoint", phase: "request" },
                    function: { id: "notifyOrder", body: "$response.body" },
                },
            }),
        }), { triggers, functions, sources } as any)).rejects.toThrow("request-phase triggers cannot reference $response");
    });

    test("lists triggers and toggles enabled state", async () => {
        const triggers = new InMemoryTriggerRepository();
        await triggers.createTrigger({
            id: "notify-on-order",
            label: "Notify on order",
            enabled: true,
            event: { kind: "endpoint", source: "orders", endpoint: "createOrder", phase: "response" },
            function: { id: "notifyOrder" },
        });

        const listed = await listTriggers(new Request("http://localhost/cms/api/triggers"), { triggers } as any);
        const toggled = await setTriggerEnabled(new Request("http://localhost/cms/api/triggers/enabled", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: "notify-on-order", enabled: false }),
        }), { triggers } as any);

        expect(listed.status).toBe(200);
        expect(await listed.json()).toEqual([
            expect.objectContaining({ id: "notify-on-order", enabled: true }),
        ]);
        expect(toggled.status).toBe(200);
        expect(await toggled.json()).toMatchObject({ id: "notify-on-order", enabled: false });
        expect((await triggers.getTrigger("notify-on-order"))?.enabled).toBe(false);
    });

    test("returns 501 when no repository is configured", async () => {
        const response = await listTriggers(new Request("http://localhost/cms/api/triggers"), {} as any);

        expect(response.status).toBe(501);
    });
});
