import { describe, expect, spyOn, test } from "bun:test";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import { InMemoryFunctionRepository, type CmsFunction } from "@bernouy/cms-functions";
import { InMemoryIdentityService } from "@bernouy/cms-identities";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import {
    InMemorySourceOverlayRepository,
    InMemorySourceRepository,
    SourceOverlaySourceRepository,
} from "@bernouy/cms-sources";
import { InMemoryTriggerRepository } from "@bernouy/cms-triggers";
import type { Middleware, RouteHandler, Runner } from "@bernouy/http-runner";
import { mountControlSourceProxy } from "cms-control/core/control/sourceProxy";
import type { ControlCmsState } from "cms-control/core/control/types";
import type { CMS_ROLES } from "types/roles";

describe("Control source schema invalidation contract", () => {
    test.each([
        ["a directly invoked system function", "system-functions/refreshCatalog", "POST"],
        ["a synchronous response trigger", "catalog/touchProduct", "POST"],
    ] as const)("refreshes overlays after %s", async (_name, path, method) => {
        const harness = await controlHarness();
        const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(harness.fetchImpl);
        try {
            expect(await harness.fieldIds()).toEqual(["legacyCode"]);
            expect(harness.fieldSourceCalls()).toBe(1);

            const response = await harness.handler(method)(new Request(
                `http://control/.cms/sources/${path}`,
                { method },
            ));

            expect(response.status).toBe(200);
            expect(await harness.fieldIds()).toEqual(["freshCode"]);
            expect(harness.fieldSourceCalls()).toBe(2);
        } finally {
            fetchSpy.mockRestore();
        }
    });
});

async function controlHarness() {
    let field = { id: "legacyCode", label: "Legacy code" };
    let fieldSourceCalls = 0;
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const pathname = new URL(new Request(input, init).url).pathname;
        if (pathname === "/fields") {
            fieldSourceCalls += 1;
            return Response.json({ fields: [{ ...field, type: "string" }] });
        }
        if (pathname === "/refresh-schema") {
            field = { id: "freshCode", label: "Fresh code" };
            return Response.json({ schemaRevision: 2 });
        }
        if (pathname === "/touch-product") return Response.json({ ok: true });
        return new Response("not found", { status: 404 });
    }) as typeof fetch;
    const sources = new InMemorySourceRepository();
    const sourceOverlays = new InMemorySourceOverlayRepository();
    const functions = new InMemoryFunctionRepository();
    const triggers = new InMemoryTriggerRepository();
    await sources.createSource(catalogSource());
    await sourceOverlays.upsertOverlay({
        id: "catalog-fields",
        sourceId: "catalog",
        output: [{ endpointId: "getProduct" }],
        fieldSource: { endpointId: "listFields" },
        fields: [],
    });
    await functions.createFunction(refreshFunction);
    await triggers.createTrigger({
        id: "refresh-after-touch",
        enabled: true,
        event: { kind: "endpoint", source: "catalog", endpoint: "touchProduct", phase: "response" },
        mode: "sync",
        function: { id: refreshFunction.id },
    });
    const mounted = captureSourceHandlers();
    const overlaySources = new SourceOverlaySourceRepository(sources, sourceOverlays, { deps: { fetchImpl } });
    mountControlSourceProxy({
        runner: mounted.runner,
        sources,
        sourceOverlays,
        functions,
        triggers,
        auth: new InMemoryAuthentication<CMS_ROLES>({ role: "admin" }),
        roles: new InMemoryRolesRepository(),
        secrets: new InMemorySecretStore(),
        identities: new InMemoryIdentityService(),
    } as unknown as ControlCmsState, (async (_request, next) => next()) satisfies Middleware, undefined);

    return {
        fetchImpl,
        fieldSourceCalls: () => fieldSourceCalls,
        handler: mounted.handler,
        async fieldIds() {
            const endpoint = await overlaySources.getEndpoint("urn:catalog:getProduct");
            const metadata = endpoint?.output?.[0]?.body?.properties?.metadata;
            return Object.keys(metadata?.properties ?? {});
        },
    };
}

function catalogSource() {
    return {
        urn: "urn:catalog",
        endpoints: [{
            urn: "urn:catalog:getProduct", method: "GET" as const,
            targetUrl: "https://catalog.example/product",
            output: [{ status: "200", body: { type: "object" as const } }],
        }, {
            urn: "urn:catalog:listFields", method: "GET" as const,
            targetUrl: "https://catalog.example/fields",
            output: [{ status: "200", body: { type: "object" as const } }],
        }, {
            urn: "urn:catalog:refreshSchema", method: "POST" as const,
            targetUrl: "https://catalog.example/refresh-schema",
            effects: { invalidatesSchema: true as const },
            output: [{ status: "200", body: { type: "object" as const } }],
        }, {
            urn: "urn:catalog:touchProduct", method: "POST" as const,
            targetUrl: "https://catalog.example/touch-product",
            output: [{ status: "200", body: { type: "object" as const } }],
        }],
    };
}

const refreshFunction: CmsFunction = {
    id: "refreshCatalog",
    method: "POST",
    steps: [{ id: "refreshed", call: { source: "catalog", endpoint: "refreshSchema" } }],
    return: { body: "$steps.refreshed" },
};

function captureSourceHandlers() {
    const handlers = new Map<string, RouteHandler>();
    const runner = {
        basePath: "/",
        group: (_prefix, mount) => mount({
            setDefaultEndpoint: (
                method: Parameters<Runner["setDefaultEndpoint"]>[0],
                handler: RouteHandler,
            ) => { handlers.set(method, handler); },
        } as unknown as Runner),
    } as Runner;
    return {
        runner,
        handler(method: string): RouteHandler {
            const handler = handlers.get(method);
            if (!handler) throw new Error(`missing ${method} source handler`);
            return handler;
        },
    };
}
