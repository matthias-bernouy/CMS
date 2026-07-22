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
});
