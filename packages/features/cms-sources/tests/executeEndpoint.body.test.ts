import { describe, expect, test } from "bun:test";
import { executeEndpoint } from "cms-sources/core/executeEndpoint";
import { ep, okFetch } from "./helpers/executeEndpointFixtures";

describe("executeEndpoint JSON body coercion", () => {
    test("coerces JSON body scalar values from the declared endpoint body shape", async () => {
        const fetchImpl = okFetch();
        const endpoint = ep({
            method: "POST",
            input: { body: { type: "object", properties: {
                email: { type: "string" },
                subscribed: { type: "boolean" },
                active: { type: "boolean" },
                consent: { type: "boolean" },
                numeric: { type: "boolean" },
                employeeCount: { type: "number" },
                nested: { type: "object", properties: {
                    marketing: { type: "boolean" },
                    score: { type: "number" },
                } },
            } } },
        });

        await executeEndpoint(endpoint, new Request("http://local/x", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                email: "reader@example.com",
                subscribed: "true",
                active: "on",
                consent: "0",
                numeric: 1,
                employeeCount: "12",
                nested: { marketing: "false", score: "9.5" },
            }),
        }), { fetchImpl });

        expect((fetchImpl.mock.calls[0]![1] as RequestInit).body).toBe(JSON.stringify({
            email: "reader@example.com",
            subscribed: true,
            active: true,
            consent: false,
            numeric: true,
            employeeCount: 12,
            nested: { marketing: false, score: 9.5 },
        }));
    });

    test("rejects invalid JSON boolean values declared by the endpoint body shape", async () => {
        const fetchImpl = okFetch();
        const endpoint = ep({ method: "POST", input: { body: { type: "object", properties: { subscribed: { type: "boolean" } } } } });
        const response = await executeEndpoint(endpoint, new Request("http://local/x", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ subscribed: "maybe" }),
        }), { fetchImpl });
        expect(response.status).toBe(400);
        expect(await response.text()).toBe("body.subscribed must be a boolean");
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test("preserves null for explicitly nullable scalar body fields", async () => {
        const fetchImpl = okFetch();
        const endpoint = ep({
            method: "POST",
            input: { body: { type: "object", properties: {
                subscribed: { type: "boolean", nullable: true },
                employeeCount: { type: "number", nullable: true },
            } } },
        });

        await executeEndpoint(endpoint, new Request("http://local/x", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ subscribed: null, employeeCount: null }),
        }), { fetchImpl });

        expect((fetchImpl.mock.calls[0]![1] as RequestInit).body)
            .toBe(JSON.stringify({ subscribed: null, employeeCount: null }));
    });

    test("does not coerce JSON bodies when endpoint has no body shape", async () => {
        const fetchImpl = okFetch();
        await executeEndpoint(ep({ method: "POST" }), new Request("http://local/x", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ subscribed: "true" }),
        }), { fetchImpl });
        const passed = fetchImpl.mock.calls[0]![1] as RequestInit;
        expect(await new Response(passed.body).text()).toBe(JSON.stringify({ subscribed: "true" }));
    });
});
