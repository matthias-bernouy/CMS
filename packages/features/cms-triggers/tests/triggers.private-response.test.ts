import { describe, expect, test } from "bun:test";
import { projectEndpointResponse } from "@bernouy/cms-sources";
import { createTriggerInterceptor } from "@bernouy/cms-triggers";
import {
    endpoint,
    fixture,
    jsonRequest,
    tick,
    trigger,
} from "./helpers/triggerFixtures";

const projectedEndpoint = {
    ...endpoint,
    output: [{
        status: "201",
        body: { type: "object" as const, properties: { id: { type: "string" as const } } },
        triggerBody: {
            type: "object" as const,
            properties: { authorizationId: { type: "string" as const } },
        },
    }],
};

describe("cms-triggers private response projection", () => {
    test("uses server-only response data without returning it to the caller", async () => {
        const { response, calls } = await runPrivateResponseTrigger("sync");

        expect(await response.json()).toEqual({ id: "order-1" });
        expect(calls).toEqual([expectedCall]);
    });

    test("keeps server-only response data available to async triggers", async () => {
        const { response, calls, triggers } = await runPrivateResponseTrigger("async");

        expect(await response.json()).toEqual({ id: "order-1" });
        await tick();
        expect(calls).toEqual([expectedCall]);
        expect((await triggers.getTrigger("notify-private-async"))?.lastRun?.status).toBe("ok");
    });

    test("keeps the response body limit for private projections", async () => {
        const { triggers, functions, sources, calls } = await fixture();
        await triggers.createTrigger(trigger({
            id: "bounded-private",
            event: { kind: "endpoint", source: "orders", endpoint: "createOrder", phase: "response" },
            mode: "sync",
            condition: { exists: "$response.body.authorizationId" },
            function: { id: "notifyOrder" },
        }));

        const request = jsonRequest({ ok: true });
        const interceptEndpoint = createTriggerInterceptor({
            triggers,
            functions,
            sources,
            maxBodyBytes: 32,
        });
        const response = await interceptEndpoint(projectedEndpoint, request, req => projectEndpointResponse(
            projectedEndpoint,
            req,
            Response.json({ id: "order-1", authorizationId: "x".repeat(100) }, { status: 201 }),
        ));

        expect(await response.json()).toEqual({ id: "order-1" });
        expect(calls).toEqual([]);
    });
});

const expectedCall = {
    url: "https://api.example.com/notify?order=authorization-1&source=orders&actor=user-1",
    body: { method: "POST", email: "a@example.test" },
};

async function runPrivateResponseTrigger(mode: "sync" | "async") {
    const { triggers, functions, sources, calls } = await fixture();
    await triggers.createTrigger(trigger({
        id: `notify-private-${mode}`,
        event: { kind: "endpoint", source: "orders", endpoint: "createOrder", phase: "response" },
        mode,
        function: {
            id: "notifyOrder",
            params: {
                order: "$response.body.authorizationId",
                source: "$endpoint.source",
                actor: "$ctx.user.id",
            },
            body: { method: "$request.method", email: "$request.body.customer.email" },
        },
    }));
    const interceptEndpoint = createTriggerInterceptor({
        triggers,
        functions,
        sources,
        deps: {
            fetchImpl: async (url, init) => {
                calls.push({
                    url: String(url),
                    body: init?.body ? await new Response(init.body).json() : undefined,
                });
                return Response.json({ ok: true });
            },
        },
        resolveUser: async () => ({ id: "user-1" }),
    });
    const request = jsonRequest({ customer: { email: "a@example.test" } });
    const response = await interceptEndpoint(projectedEndpoint, request, req => projectEndpointResponse(
        projectedEndpoint,
        req,
        Response.json({ id: "order-1", authorizationId: "authorization-1" }, { status: 201 }),
    ));
    return { response, calls, triggers };
}
