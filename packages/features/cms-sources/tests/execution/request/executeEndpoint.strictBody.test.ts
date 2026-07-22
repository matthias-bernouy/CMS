import { describe, expect, test } from "bun:test";
import { executeEndpoint } from "cms-sources/core/execution/executeEndpoint";
import { ep, okFetch } from "../../helpers/executeEndpointFixtures";

describe("executeEndpoint strict JSON bodies", () => {
    test("forwards only properties declared by structured body shapes", async () => {
        const fetchImpl = okFetch();
        const endpoint = strictEndpoint();

        const response = await executeEndpoint(
            endpoint,
            new Request("http://local/x", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    offerId: "offer-1",
                    quantity: "2",
                    selection: { relayId: "relay-1" },
                    items: [{ id: "item-1" }],
                    providerData: { campaign: "summer", arbitrary: true },
                }),
            }),
            { fetchImpl },
        );

        expect(response.status).toBe(200);
        expect((fetchImpl.mock.calls[0]![1] as RequestInit).body).toBe(
            JSON.stringify({
                offerId: "offer-1",
                quantity: 2,
                selection: { relayId: "relay-1" },
                items: [{ id: "item-1" }],
                providerData: { campaign: "summer", arbitrary: true },
            }),
        );
    });

    test.each([
        ["root", { offerId: "offer-1", price: 1 }, "body.price is not allowed"],
        [
            "nested object",
            { selection: { relayId: "relay-1", ownerUserId: "another-user" } },
            "body.selection.ownerUserId is not allowed",
        ],
        ["array item", { items: [{ id: "item-1", price: 1 }] }, "body.items.0.price is not allowed"],
    ])("rejects an undeclared %s property before calling upstream", async (_name, body, message) => {
        const fetchImpl = okFetch();

        const response = await executeEndpoint(
            strictEndpoint(),
            new Request("http://local/x", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            }),
            { fetchImpl },
        );

        expect(response.status).toBe(400);
        expect(await response.text()).toBe(message);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test("rejects non-JSON content when a JSON body shape is declared", async () => {
        const fetchImpl = okFetch();
        const endpoint = ep({
            method: "POST",
            input: {
                body: {
                    type: "object",
                    properties: { offerId: { type: "string" } },
                },
            },
        });

        const response = await executeEndpoint(
            endpoint,
            new Request("http://local/x", {
                method: "POST",
                headers: { "content-type": "text/plain" },
                body: JSON.stringify({ offerId: "offer-1", status: "paid" }),
            }),
            { fetchImpl },
        );

        expect(response.status).toBe(415);
        expect(await response.text()).toBe("JSON body required");
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});

function strictEndpoint() {
    return ep({
        method: "POST",
        output: [{ status: "200" }],
        input: {
            body: {
                type: "object",
                properties: {
                    offerId: { type: "string" },
                    quantity: { type: "number" },
                    selection: {
                        type: "object",
                        properties: { relayId: { type: "string" } },
                    },
                    items: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: { id: { type: "string" } },
                        },
                    },
                    providerData: { type: "object" },
                },
            },
        },
    });
}
