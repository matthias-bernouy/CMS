import { describe, expect, spyOn, test } from "bun:test";
import { createTriggerInterceptor } from "@bernouy/cms-triggers";
import {
    endpoint,
    fixture,
    jsonRequest,
    tick,
    trigger,
} from "./helpers/triggerFixtures";

describe("cms-triggers runtime", () => {
    test("loads matching request and response triggers with one repository query", async () => {
        const { triggers, functions, sources } = await fixture();
        const matchingQuery = spyOn(triggers, "findEndpointTriggers");
        const fullQuery = spyOn(triggers, "getAllTriggers");
        const interceptEndpoint = createTriggerInterceptor({ triggers, functions, sources });

        const response = await interceptEndpoint(endpoint, jsonRequest({ ok: true }), async () => Response.json({ ok: true }));

        expect(response.status).toBe(200);
        expect(matchingQuery).toHaveBeenCalledTimes(1);
        expect(matchingQuery).toHaveBeenCalledWith("orders", "createOrder");
        expect(fullQuery).not.toHaveBeenCalled();
    });

    test("keeps legacy repositories working with one full fallback read", async () => {
        const { triggers, functions, sources } = await fixture();
        const fullQuery = spyOn(triggers, "getAllTriggers");
        Object.defineProperty(triggers, "findEndpointTriggers", { value: undefined });
        const interceptEndpoint = createTriggerInterceptor({ triggers, functions, sources });

        await interceptEndpoint(endpoint, jsonRequest({ ok: true }), async () => Response.json({ ok: true }));

        expect(fullQuery).toHaveBeenCalledTimes(1);
    });

    test("resolves request, response, endpoint and ctx refs when calling a function", async () => {
        const { triggers, functions, sources, calls } = await fixture();
        await triggers.createTrigger(trigger({
            id: "notify",
            event: { kind: "endpoint", source: "orders", endpoint: "createOrder", phase: "response" },
            mode: "sync",
            condition: { equals: ["$response.status", 201] },
            function: {
                id: "notifyOrder",
                params: { order: "$response.body.id", source: "$endpoint.source", actor: "$ctx.user.id" },
                body: { method: "$request.method", email: "$request.body.customer.email" },
            },
        }));

        const interceptEndpoint = createTriggerInterceptor({
            triggers,
            functions,
            sources,
            deps: {
                fetchImpl: async (url, init) => {
                    calls.push({ url: String(url), body: init?.body ? await new Response(init.body).json() : undefined });
                    return Response.json({ ok: true });
                },
            },
            resolveUser: async () => ({ id: "user-1", role: "admin" }),
        });
        const response = await interceptEndpoint(endpoint, jsonRequest({ customer: { email: "a@example.test" } }), async () =>
            Response.json({ id: "order-1" }, { status: 201 }));

        expect(response.status).toBe(201);
        expect(calls).toEqual([{
            url: "https://api.example.com/notify?order=order-1&source=orders&actor=user-1",
            body: { method: "POST", email: "a@example.test" },
        }]);
        expect((await triggers.getTrigger("notify"))?.lastRun?.status).toBe("ok");
    });

    test("blocks sync request triggers by default when the function fails", async () => {
        const { triggers, functions, sources } = await fixture();
        await triggers.createTrigger(trigger({
            id: "guard",
            event: { kind: "endpoint", source: "orders", endpoint: "createOrder", phase: "request" },
            mode: "sync",
            function: { id: "missingFunction" },
        }));
        let upstreamCalled = false;
        const interceptEndpoint = createTriggerInterceptor({ triggers, functions, sources });

        const response = await interceptEndpoint(endpoint, jsonRequest({ ok: true }), async () => {
            upstreamCalled = true;
            return Response.json({ ok: true });
        });

        expect(response.status).toBe(502);
        expect(upstreamCalled).toBe(false);
        expect((await triggers.getTrigger("guard"))?.lastRun?.status).toBe("error");
    });

    test("ignores sync response trigger failures by default unless failureMode is block", async () => {
        const { triggers, functions, sources } = await fixture();
        await triggers.createTrigger(trigger({
            id: "responseLog",
            event: { kind: "endpoint", source: "orders", endpoint: "createOrder", phase: "response" },
            mode: "sync",
            function: { id: "missingFunction" },
        }));
        const interceptEndpoint = createTriggerInterceptor({ triggers, functions, sources });

        const response = await interceptEndpoint(endpoint, jsonRequest({ ok: true }), async () =>
            Response.json({ ok: true }, { status: 202 }));
        expect(response.status).toBe(202);
        expect((await triggers.getTrigger("responseLog"))?.lastRun?.status).toBe("error");

        await triggers.updateTrigger(trigger({
            id: "responseLog",
            event: { kind: "endpoint", source: "orders", endpoint: "createOrder", phase: "response" },
            mode: "sync",
            failureMode: "block",
            function: { id: "missingFunction" },
        }));
        const blocked = await interceptEndpoint(endpoint, jsonRequest({ ok: true }), async () =>
            Response.json({ ok: true }, { status: 202 }));
        expect(blocked.status).toBe(502);
    });

    test("async failures preserve the original response and update lastRun later", async () => {
        const { triggers, functions, sources } = await fixture();
        await triggers.createTrigger(trigger({
            id: "asyncLog",
            event: { kind: "endpoint", source: "orders", endpoint: "createOrder", phase: "response" },
            function: { id: "missingFunction" },
        }));
        const interceptEndpoint = createTriggerInterceptor({ triggers, functions, sources });

        const response = await interceptEndpoint(endpoint, jsonRequest({ ok: true }), async () =>
            new Response(null, { status: 204 }));

        expect(response.status).toBe(204);
        await tick();
        expect((await triggers.getTrigger("asyncLog"))?.lastRun?.status).toBe("error");
    });
});
