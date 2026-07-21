import { describe, expect, test } from "bun:test";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import { InMemorySourceRepository, makeEndpointUrn, makeSourceUrn } from "@bernouy/cms-sources";
import executeAdminFunction from "cms-control/api/functions/execute.post";
import createFunction from "cms-control/api/functions/create.post";
import getFunctionCatalog from "cms-control/api/functions/catalog.get";
import getFunctionDetail from "cms-control/api/functions/detail.get";
import listFunctions from "cms-control/api/functions.get";

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

    test("returns one function detail for the admin detail page", async () => {
        const functions = new InMemoryFunctionRepository();
        await functions.createFunction(echoFunction());

        const response = await getFunctionDetail(
            new Request("http://localhost/cms/api/functions/detail?id=echoPayload"),
            { functions } as any,
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            id: "echoPayload",
            label: "Echo payload",
            bodyLabel: "Body: name",
            bodySample: { name: "" },
            return: {
                status: 200,
                body: {
                    body: "$input.body",
                    userId: "$ctx.user.id",
                },
            },
        });
    });

    test("executes a function from the admin endpoint", async () => {
        const functions = new InMemoryFunctionRepository();
        await functions.createFunction(echoFunction());

        const response = await executeAdminFunction(
            new Request("http://localhost/cms/api/functions/execute", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    id: "echoPayload",
                    params: {},
                    body: { name: "Ada" },
                }),
            }),
            {
                auth: {
                    getSubject: async () => ({ identifier: "admin-1", role: "admin" }),
                },
                functions,
                sources: new InMemorySourceRepository(),
                sourceExecutorDeps: {},
            } as any,
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            body: { name: "Ada" },
            userId: "admin-1",
        });
    });

    test("returns a correlated source failure without exposing upstream details", async () => {
        const functions = new InMemoryFunctionRepository();
        await functions.createFunction(sendEmailFunction());
        const sources = new InMemorySourceRepository();
        await sources.createSource(emailerSource());

        const response = await executeAdminFunction(
            new Request("http://localhost/cms/api/functions/execute", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ id: "sendEmail" }),
            }),
            {
                auth: {
                    getSubject: async () => ({ identifier: "admin-1", role: "admin" }),
                },
                functions,
                sources,
                sourceExecutorDeps: {
                    fetchImpl: async () =>
                        new Response(JSON.stringify({ error: "missing required token: user.name" }), {
                            status: 400,
                            headers: { "content-type": "application/json" },
                        }),
                },
            } as any,
        );

        expect(response.status).toBe(502);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        const correlationId = response.headers.get("x-correlation-id");
        expect(correlationId).toMatch(/^[0-9a-f-]{36}$/);
        const body = await response.json();
        expect(body).toEqual({
            error: "Function execution failed",
            correlationId,
        });
        expect(JSON.stringify(body)).not.toContain("missing required token");
    });

    test("returns 501 when no repository is configured", async () => {
        const response = await listFunctions(new Request("http://localhost/cms/api/functions"), {} as any);

        expect(response.status).toBe(501);
    });
});

function echoFunction() {
    return {
        id: "echoPayload",
        method: "POST" as const,
        access: { mode: "admin" as const },
        meta: {
            name: "Echo payload",
            description: "Returns the submitted body.",
        },
        input: {
            body: {
                type: "object" as const,
                properties: { name: { type: "string" as const } },
                required: ["name"],
            },
        },
        output: [{ status: "200", body: { type: "object" as const } }],
        steps: [],
        return: {
            status: 200,
            body: {
                body: "$input.body",
                userId: "$ctx.user.id",
            },
        },
    };
}

function sendEmailFunction() {
    return {
        id: "sendEmail",
        method: "POST" as const,
        steps: [
            {
                id: "message",
                call: {
                    source: "emailer",
                    endpoint: "sendTemplateEmail",
                    body: {
                        key: "newsletter",
                        toEmails: ["ada@example.test"],
                        data: {},
                    },
                },
            },
        ],
        return: { status: 200, body: "$steps.message" },
    };
}

function emailerSource() {
    return {
        urn: makeSourceUrn("emailer"),
        meta: { name: "Emailer" },
        endpoints: [
            {
                urn: makeEndpointUrn("emailer", "sendTemplateEmail"),
                method: "POST" as const,
                targetUrl: "https://emailer.test/template/send",
                input: {
                    params: [],
                    body: {
                        type: "object" as const,
                        properties: {
                            key: { type: "string" as const },
                            toEmails: { type: "array" as const, items: { type: "string" as const } },
                            data: { type: "object" as const },
                        },
                        required: ["key", "toEmails"],
                    },
                },
                output: [{ status: "200", body: { type: "object" as const } }],
            },
        ],
    };
}
