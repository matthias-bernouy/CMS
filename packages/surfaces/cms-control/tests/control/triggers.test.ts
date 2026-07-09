import { describe, expect, test } from "bun:test";
import { InMemoryTriggerRepository } from "@bernouy/cms-triggers";
import listTriggers from "cms-control/api/triggers/triggers.get";
import setTriggerEnabled from "cms-control/api/triggers/enabled.post";

describe("triggers API", () => {
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
