import { expect, test } from "bun:test";
import { CapabilityGateway } from "@bernouy/cms-gateway";
import { createCapabilityQueryHandler, handleGatewayHttpCall } from "@bernouy/cms-gateway/http/handlers";
import { scope, context, http } from "./fixture";
import { NOW } from "../../fixtures";

test("native and logical HTTP routes retain publisher ownership and instance isolation", async () => {
    const routes = new Map();
    for (const publisher of ["ulvia", "other"]) {
        const f = await scope([http()], {
            contractId: `${publisher}/catalog`,
            providerId: `${publisher}/primary-provider`,
        });
        routes.set(`${publisher}/catalog`, f.route);
    }
    const dispatches: string[] = [];
    const gateway = new CapabilityGateway({
        routes: {
            resolve: async (siteId, contractId) => (siteId === "site-a" ? (routes.get(contractId) ?? null) : null),
            isCurrent: async () => true,
        },
        authorize: async () => true,
        now: () => NOW,
        transport: {
            send: async (request) => {
                dispatches.push(request.release.contractId);
                return {
                    status: 200,
                    contentType: "application/json",
                    output: { items: [request.release.contractId] },
                };
            },
        },
    });
    const logical = createCapabilityQueryHandler({
        siteId: "site-a",
        basePath: "",
        invoker: gateway,
        resolveActor: async () => context.actor,
        resolveCapability: async () => ({ access: "public", effect: "query", outputType: "object" }),
    });
    for (const publisher of ["ulvia", "other"]) {
        const native = await handleGatewayHttpCall(
            new Request(`https://site.test/.cms/call/${publisher}/catalog/v1/items`),
            { ...context, prefix: "/.cms/call", invoker: gateway },
        );
        expect(native.status).toBe(200);
        expect(await native.json()).toEqual({ items: [`${publisher}/catalog`] });
        const response = await logical(new Request(`https://site.test/.cms/query/${publisher}/catalog/item.list`));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ items: [`${publisher}/catalog`] });
    }
    expect(dispatches).toEqual(["ulvia/catalog", "ulvia/catalog", "other/catalog", "other/catalog"]);
    const crossInstance = await handleGatewayHttpCall(
        new Request("https://site.test/.cms/call/ulvia/catalog/v1/items"),
        { ...context, siteId: "site-b", prefix: "/.cms/call", invoker: gateway },
    );
    expect(crossInstance.status).toBe(404);
    const unqualified = await handleGatewayHttpCall(new Request("https://site.test/.cms/call/catalog/v1/items"), {
        ...context,
        prefix: "/.cms/call",
        invoker: gateway,
    });
    expect(unqualified.status).not.toBe(200);
    expect(dispatches).toHaveLength(4);
});
