import { describe, expect, spyOn, test } from "bun:test";
import { InMemoryAuthentication, resolveRequestSubject, type Subject } from "@bernouy/cms-auth";
import { InMemorySourceRepository, type SourceRequestObservation } from "@bernouy/cms-sources";
import type { RouteHandler, Runner } from "@bernouy/http-runner";
import type DeliveryCms from "cms-delivery/DeliveryCms";
import { registerDeliverySourceProxy } from "cms-delivery/core/sources/registerSourceProxy";

describe("Delivery source subject scope", () => {
    test("shares one subject through authorization and source context", async () => {
        const authentication = new CountingAuthentication();
        const sources = new InMemorySourceRepository();
        await sources.createSource({
            urn: "urn:orders",
            endpoints: [
                {
                    urn: "urn:orders:create",
                    method: "POST",
                    access: { mode: "auth" },
                    targetUrl: "https://connector.example.test/orders",
                    headers: [{ name: "x-cms-user-id", source: { from: "computed", ref: "userID" } }],
                    output: [{ status: "200", body: { type: "object" } }],
                },
            ],
        });
        const mounted = captureSourceHandler();
        const observations: SourceRequestObservation[] = [];
        registerDeliverySourceProxy({
            runner: mounted.runner,
            sources,
            auth: {
                subject: (request) => resolveRequestSubject(authentication, request),
                buildLoginUrl: (returnTo) => authentication.buildLoginUrl(returnTo),
            },
            sourceTelemetry: {
                observe(observation: SourceRequestObservation) {
                    observations.push(observation);
                },
            },
        } as unknown as DeliveryCms);
        const upstream = spyOn(globalThis, "fetch").mockImplementation((async (
            _input: RequestInfo | URL,
            init?: RequestInit,
        ) => {
            expect(new Headers(init?.headers).get("x-cms-user-id")).toBe("member-1");
            return Response.json({ created: true });
        }) as unknown as typeof fetch);

        try {
            for (const expectedCalls of [1, 2]) {
                const response = await mounted.handler(
                    new Request("http://site/.cms/sources/orders/create", { method: "POST" }),
                );

                expect(response.status).toBe(200);
                expect(authentication.calls).toBe(expectedCalls);
            }
            expect(upstream).toHaveBeenCalledTimes(2);
            expect(observations).toHaveLength(2);
            expect(observations.every((observation) => observation.stagesMs.cms_auth !== undefined)).toBe(true);
        } finally {
            upstream.mockRestore();
        }
    });
});

class CountingAuthentication extends InMemoryAuthentication {
    calls = 0;

    constructor() {
        super({ identifier: "member-1" });
    }

    override async getSubject(request: Request): Promise<Subject> {
        this.calls += 1;
        return super.getSubject(request);
    }
}

function captureSourceHandler(): { runner: Runner; handler: RouteHandler } {
    let handler: RouteHandler | undefined;
    const runner = {
        basePath: "/",
        group: (_prefix, mount) =>
            mount({
                setDefaultEndpoint: (method: Parameters<Runner["setDefaultEndpoint"]>[0], candidate: RouteHandler) => {
                    if (method === "POST") {
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
