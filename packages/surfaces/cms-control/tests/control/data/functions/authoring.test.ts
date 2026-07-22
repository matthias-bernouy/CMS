import { describe, expect, test } from "bun:test";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import executeAdminFunction from "cms-control/api/_platform/functions/execute.post";
import createFunction from "cms-control/api/_platform/functions/create.post";
import getFunctionCatalog from "cms-control/api/_platform/functions/catalog.get";
import getFunctionDetail from "cms-control/api/_platform/functions/detail.get";
import listFunctions from "cms-control/api/_platform/functions.get";
import { echoFunction, emailerSource, sendEmailFunction } from "./support";

describe("functions API", () => {
    test("creates a validated function from the admin authoring endpoint", async () => {
        const functions = new InMemoryFunctionRepository();
        const sources = new InMemorySourceRepository();
        const response = await createFunction(
            new Request("http://localhost/cms/api/functions/create", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ definition: echoFunction() }),
            }),
            { functions, sources } as any,
        );

        expect(response.status).toBe(201);
        expect(await response.json()).toMatchObject({ id: "echoPayload", label: "Echo payload" });
        expect(await functions.getFunction("echoPayload")).toEqual(echoFunction());
    });

    test("returns the source catalog used by the function authoring UI", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource(emailerSource());

        const response = await getFunctionCatalog(new Request("http://localhost/cms/api/functions/catalog"), {
            sources,
        } as any);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual([
            expect.objectContaining({
                id: "emailer",
                label: "Emailer",
                endpoints: [expect.objectContaining({ endpointId: "sendTemplateEmail", method: "POST" })],
            }),
        ]);
    });

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
        expect(await response.json()).toEqual([
            {
                id: "shipPaidOrder",
                label: "Ship paid order",
                description: "Creates a shipment after payment checks.",
                method: "POST",
                access: "auth",
                paramsLabel: "Params: orderId",
                bodyLabel: "Body: carrier",
                inputLabel: "Params: orderId / Body: carrier",
                stepsLabel: "4 steps",
                outputLabel: "201, default",
                returnLabel: "201 body",
                params: { orderId: { type: "string" } },
                body: {
                    type: "object",
                    properties: { carrier: { type: "string" } },
                },
                paramsSample: { orderId: "" },
                bodySample: { carrier: "" },
            },
        ]);
    });
});
