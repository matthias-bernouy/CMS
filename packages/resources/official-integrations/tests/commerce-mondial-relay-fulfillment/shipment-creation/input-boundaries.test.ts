import { describe, expect, test } from "bun:test";
import { expectGenericFailure } from "../order-contexts/shared/harness";
import { executeShipmentCreation, functionId, shipmentCreationRequest } from "./harness";
import { creationResponder, privateFailure } from "./responders";

describe("seller shipment creation input boundaries", () => {
    test("rejects malformed bodies before source work", async () => {
        const invalidJson = new Request(
            `https://cms.test/functions/${functionId}`,
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: "{",
            },
        );
        const cases: Array<[Request, string]> = [
            [invalidJson, "Invalid JSON body"],
            [shipmentCreationRequest([]), "body must be an object"],
            [shipmentCreationRequest({}), "body.orderId is required"],
            [shipmentCreationRequest({ orderId: null }),
                "body.orderId must be a string"],
            [shipmentCreationRequest({ orderId: 42 }),
                "body.orderId must be a string"],
            [shipmentCreationRequest({ orderId: "42", extra: true }),
                "body.extra is not allowed"],
        ];

        for (const [request, error] of cases) {
            const { response, calls } = await executeShipmentCreation(
                creationResponder(),
                { request },
            );
            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({ error });
            expect(calls).toEqual([]);
        }
    });

    test("fails without an execution identity before outgoing fetch", async () => {
        const { response, calls } = await executeShipmentCreation(
            creationResponder(),
            { user: null },
        );

        await expectGenericFailure(response);
        expect(calls).toEqual([]);
    });

    test("forwards every historical string selector to mySale", async () => {
        for (const [selector, forwarded] of [
            ["", null],
            ["abc", "abc"],
            ["1.2", "1.2"],
            ["9007199254740992", "9007199254740992"],
        ] as const) {
            const { response, calls } = await executeShipmentCreation(
                creationResponder({
                    sale: privateFailure(400, "invalid private selector"),
                }),
                { request: shipmentCreationRequest({ orderId: selector }) },
            );

            await expectGenericFailure(response);
            expect(calls).toHaveLength(1);
            expect(calls[0]?.url.pathname).toBe("/mySale");
            expect(calls[0]?.url.searchParams.get("id")).toBe(forwarded);
        }
    });

    test("preserves the bodyless request as a nested Source failure", async () => {
        const { response, calls } = await executeShipmentCreation(
            creationResponder({
                sale: privateFailure(400, "id or publicId is required"),
            }),
            { request: shipmentCreationRequest() },
        );

        await expectGenericFailure(response);
        expect(calls).toHaveLength(1);
        expect(calls[0]?.url.pathname).toBe("/mySale");
        expect(calls[0]?.url.searchParams.get("id")).toBeNull();
    });

    test("redacts every initial Commerce failure", async () => {
        for (const status of [400, 404, 500]) {
            const { response, calls } = await executeShipmentCreation(
                creationResponder({
                    sale: privateFailure(status, "private sale failure"),
                }),
            );

            await expectGenericFailure(response);
            expect(calls.map(call => call.url.pathname)).toEqual(["/mySale"]);
        }
    });
});
