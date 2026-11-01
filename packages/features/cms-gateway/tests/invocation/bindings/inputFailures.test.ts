import { expect, test } from "bun:test";
import {
    handleGatewayHttpCall,
    createCapabilityMutationHandler,
    createCapabilityQueryHandler,
} from "@bernouy/cms-gateway/http/handlers";
import { scope, http, context } from "./fixture";

async function commandScope() {
    return scope([{ ...http(), method: "POST", input: { body: true } }], {
        behavior: { sensitive: false, effect: "command", execution: "sync", idempotency: "none" },
    });
}

test("HTTP schema refusals explain the field locally, without provider dispatch or command effects", async () => {
    const f = await commandScope();
    const response = await handleGatewayHttpCall(
        new Request("https://cms.test/.cms/call/catalog/v1/items", {
            method: "POST",
            headers: { "content-type": "application/json", "accept-language": "fr-CA,en;q=0.8" },
            body: JSON.stringify({ term: "x".repeat(51) }),
        }),
        { ...context, invoker: f.gateway, prefix: "/.cms/call" },
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("content-language")).toBe("fr");
    expect(await response.json()).toEqual({
        failure: {
            code: "invalid_input",
            retryable: false,
            output: { message: "Le champ « $.term » ne respecte pas le format ou les limites attendus." },
        },
    });
    expect(f.sent).toHaveLength(0);
});

test("logical query and mutation routes share localized input failures without dispatch", async () => {
    for (const effect of ["query", "command"] as const) {
        const f = effect === "command" ? await commandScope() : await scope([http()]);
        const options = {
            siteId: context.siteId,
            basePath: "",
            invoker: f.gateway,
            resolveActor: async () => context.actor,
            resolveCapability: async () => ({
                access: "public" as const,
                effect,
                outputType: "object",
                idempotency: "none" as const,
            }),
        };
        const handler =
            effect === "command" ? createCapabilityMutationHandler(options) : createCapabilityQueryHandler(options);
        const route = effect === "command" ? "mutation" : "query";
        const response = await handler(
            new Request(`https://cms.test/.cms/${route}/catalog/item.list`, {
                method: effect === "command" ? "POST" : "QUERY",
                headers: { "content-type": "application/json", "accept-language": "en" },
                body: JSON.stringify({ term: "x".repeat(51) }),
            }),
        );
        expect(response.status).toBe(400);
        expect(response.headers.get("content-language")).toBe("en");
        expect(await response.json()).toMatchObject({
            failure: {
                code: "invalid_input",
                output: { message: "Field “$.term” does not match the expected format or limits." },
            },
        });
        expect(f.sent).toHaveLength(0);
    }
});
