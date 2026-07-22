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
