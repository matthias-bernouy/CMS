import { describe, expect, spyOn, test } from "bun:test";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceOverlayRepository, InMemorySourceRepository } from "@bernouy/cms-sources";
import { InMemoryTriggerRepository } from "@bernouy/cms-triggers";
import type { Middleware, RouteHandler, Runner } from "@bernouy/http-runner";
import { mountControlSourceProxy } from "cms-control/core/admin/control/sourceProxy";
import type { ControlCmsState } from "cms-control/core/admin/control/types";
import type { CMS_ROLES } from "types/roles";

describe("Control source dependency scope", () => {
    test("shares dependency reads within one request and refreshes them for the next", async () => {
        const sources = new CountingSources();
        const overlays = new CountingOverlays();
        const functions = new CountingFunctions();
        const triggers = new CountingTriggers();
        const secrets = new CountingSecrets();
        await sources.createSource({
            urn: "urn:orders",
            endpoints: [
                {
                    urn: "urn:orders:list",
                    method: "GET",
                    targetUrl: "https://connector.example.test/orders",
                    headers: [
                        { name: "x-token-a", source: { from: "secret", ref: "${TOKEN}" } },
                        { name: "x-token-b", source: { from: "secret", ref: "${TOKEN}" } },
                    ],
                },
            ],
        });
        await functions.createFunction({ id: "audit", method: "POST", steps: [], return: {} });
        for (const id of ["audit-a", "audit-b"]) {
            await triggers.createTrigger({
                id,
                enabled: true,
                event: { kind: "endpoint", source: "orders", endpoint: "list", phase: "response" },
                mode: "sync",
                function: { id: "audit" },
            });
        }
        const mounted = captureGetHandler();
        mountControlSourceProxy(
            {
                configuration: {},
                runner: mounted.runner,
                sources,
                sourceOverlays: overlays,
                functions,
                triggers,
                auth: new InMemoryAuthentication<CMS_ROLES>({ role: "admin" }),
                roles: new InMemoryRolesRepository(),
                secrets,
            } as unknown as ControlCmsState,
            (async (_request, next) => next()) satisfies Middleware,
            undefined,
        );
        const receivedTokens: string[] = [];
        const upstream = spyOn(globalThis, "fetch").mockImplementation((async (_input, init) => {
            const headers = new Headers(init?.headers);
            expect(headers.get("x-token-a")).toBe(headers.get("x-token-b"));
            receivedTokens.push(headers.get("x-token-a") ?? "");
            return Response.json({ ok: true });
        }) as typeof fetch);

        try {
            for (const token of ["first", "second"]) {
                await secrets.set("TOKEN", token);
                const response = await mounted.handler(new Request("http://control/.cms/sources/orders/list"));
                expect(response.status).toBe(200);
            }
        } finally {
            upstream.mockRestore();
        }

        expect(receivedTokens).toEqual(["first", "second"]);
        expect({
            endpointReads: sources.endpointReads,
            sourceReads: sources.sourceReads,
            overlayReads: overlays.sourceReads,
            secretReads: secrets.reads,
            functionReads: functions.reads,
            triggerReads: triggers.reads,
        }).toEqual({
            endpointReads: 2,
            sourceReads: 2,
            overlayReads: 2,
            secretReads: 2,
            functionReads: 2,
            triggerReads: 2,
        });
    });
});

class CountingSources extends InMemorySourceRepository {
    endpointReads = 0;
    sourceReads = 0;
    override async getEndpoint(urn: string) {
        this.endpointReads++;
        return super.getEndpoint(urn);
    }
    override async getSource(urn: string) {
        this.sourceReads++;
        return super.getSource(urn);
    }
}

class CountingOverlays extends InMemorySourceOverlayRepository {
    sourceReads = 0;
    override async getOverlaysForSource(sourceId: string) {
        this.sourceReads++;
        return super.getOverlaysForSource(sourceId);
    }
}

class CountingFunctions extends InMemoryFunctionRepository {
    reads = 0;
    override async getFunction(id: string) {
        this.reads++;
        return super.getFunction(id);
    }
}

class CountingTriggers extends InMemoryTriggerRepository {
    reads = 0;
    override async findEndpointTriggers(source: string, endpoint: string) {
        this.reads++;
        return super.findEndpointTriggers(source, endpoint);
    }
}

class CountingSecrets extends InMemorySecretStore {
    reads = 0;
    override async get(key: string) {
        this.reads++;
        return super.get(key);
    }
}

function captureGetHandler(): { runner: Runner; handler: RouteHandler } {
    let handler: RouteHandler | undefined;
    const runner = {
        basePath: "/",
        group: (_prefix, mount) =>
            mount({
                setDefaultEndpoint: (method: string, candidate: RouteHandler) => {
                    if (method === "GET") {
                        handler = candidate;
                    }
                },
            } as unknown as Runner),
    } as Runner;
    return {
        runner,
        handler(request) {
            if (!handler) {
                throw new Error("missing source handler");
            }
            return handler(request);
        },
    };
}
