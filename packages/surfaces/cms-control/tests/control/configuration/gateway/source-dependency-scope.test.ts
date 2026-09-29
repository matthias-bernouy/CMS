import { describe, expect, spyOn, test } from "bun:test";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository, type SourceEndpointInterceptor } from "@bernouy/cms-sources";
import type { Middleware, RouteHandler, Runner } from "@bernouy/http-runner";
import { mountControlSourceProxy } from "cms-control/core/admin/control/sourceProxy";
import type { ControlCmsState } from "cms-control/core/admin/control/types";

describe("Control source dependency scope", () => {
    test("shares dependency reads within one request and refreshes them for the next", async () => {
        const sources = new CountingSources();
        const secrets = new CountingSecrets();
        let imageCalls = 0;
        const sourceImageInterceptor: SourceEndpointInterceptor = async (_endpoint, candidate, next) => {
            imageCalls++;
            return next(candidate);
        };
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
                    output: [
                        {
                            status: "200",
                            body: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
                        },
                    ],
                },
            ],
        });
        const mounted = captureGetHandler();
        mountControlSourceProxy(
            {
                configuration: {
                    sourceImageInterceptor,
                },
                runner: mounted.runner,
                sources,
                auth: new InMemoryAuthentication(),
                secrets,
            } as unknown as ControlCmsState,
            (async (_request, next) => next()) satisfies Middleware,
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
        expect(imageCalls).toBe(2);
        expect({
            endpointReads: sources.endpointReads,
            sourceReads: sources.sourceReads,
            secretReads: secrets.reads,
        }).toEqual({
            endpointReads: 2,
            sourceReads: 0,
            secretReads: 2,
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
