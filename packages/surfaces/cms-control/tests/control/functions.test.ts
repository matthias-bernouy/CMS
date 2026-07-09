import { describe, expect, test } from "bun:test";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import listFunctions from "cms-control/api/functions.get";

describe("functions API", () => {
    test("lists functions as admin display rows", async () => {
        const functions = new InMemoryFunctionRepository();
        await functions.createFunction({
            id: "shipPaidOrder",
            method: "POST",
            access: { mode: "auth" },
            meta: {
                name: "Ship paid order",
                description: "Creates a shipment after payment checks.",
            },
            input: {
                params: { orderId: { type: "string" } },
                body: {
                    type: "object",
                    properties: { carrier: { type: "string" } },
                },
            },
            output: [
                { status: "201", body: { type: "object" } },
                { status: "default", body: { type: "object" } },
            ],
            steps: [
                { id: "order", call: { source: "orders", endpoint: "order" } },
                {
                    id: "lines",
                    forEach: {
                        items: "$steps.order.lines",
                        max: 10,
                        steps: [{ id: "reserve", call: { source: "stock", endpoint: "reserve" } }],
                    },
                },
                { assert: { condition: { equals: ["$steps.order.status", "paid"] } } },
            ],
            return: { status: 201, body: "$steps.lines" },
        });

        const response = await listFunctions(new Request("http://localhost/cms/api/functions"), { functions } as any);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual([{
            id: "shipPaidOrder",
            label: "Ship paid order",
            description: "Creates a shipment after payment checks.",
            method: "POST",
            access: "auth",
            paramsLabel: "1 param",
            bodyLabel: "Body",
            stepsLabel: "4 steps",
            outputLabel: "201, default",
            returnLabel: "201 body",
        }]);
    });

    test("returns 501 when no repository is configured", async () => {
        const response = await listFunctions(new Request("http://localhost/cms/api/functions"), {} as any);

        expect(response.status).toBe(501);
    });
});
