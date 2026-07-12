import { describe, expect, test } from "bun:test";
import { executeFunction, type CmsFunction } from "@bernouy/cms-functions";
import { InMemorySourceRepository } from "@bernouy/cms-sources";

describe("function input projection", () => {
    test("keeps declared properties and intentionally opaque objects", async () => {
        const body = {
            title: "Safe title",
            account: { displayName: "Ada" },
            items: [{ id: "item-1" }],
            providerData: { arbitrary: true },
        };
        const response = await executeFunction(strictFunction(), functionRequest(body), {
            sources: new InMemorySourceRepository(),
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(body);
    });

    test.each([
        ["root", { title: "Safe title", role: "admin" }, "body.role is not allowed"],
        [
            "nested object",
            { account: { displayName: "Ada", ownerUserId: "another-user" } },
            "body.account.ownerUserId is not allowed",
        ],
        ["array item", { items: [{ id: "item-1", price: 1 }] }, "body.items.0.price is not allowed"],
    ])("rejects an undeclared %s property", async (_name, body, message) => {
        const response = await executeFunction(strictFunction(), functionRequest(body), {
            sources: new InMemorySourceRepository(),
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: message });
    });
});

function strictFunction(): CmsFunction {
    return {
        id: "echoSafeInput",
        method: "POST",
        input: {
            body: {
                type: "object",
                properties: {
                    title: { type: "string" },
                    account: {
                        type: "object",
                        properties: { displayName: { type: "string" } },
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
        steps: [],
        return: { body: "$input.body" },
    };
}

function functionRequest(body: unknown): Request {
    return new Request("https://cms.test/function", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}
