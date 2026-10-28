import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { OperatorObservabilityClient } from "../../../src/runtime/stack/logs/OperatorObservabilityClient";

test("local operator queries use the native loopback origin and never forward the control Bearer", async () => {
    const admission = await admitContractReleaseJson(
        await Bun.file(
            resolve(import.meta.dir, "../../../dist/bootstrap/contracts/cms/ulvia.cms.observability/definition.json"),
        ).text(),
    );
    const instanceId = "instance:operator-test";
    const requests: { path: string; authorization: string | null }[] = [];
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request) {
            const path = new URL(request.url).pathname;
            requests.push({ path, authorization: request.headers.get("authorization") });
            if (path === "/gateway/route") {
                return Response.json({
                    route: JSON.stringify({
                        selection: {
                            siteId: "default",
                            contractId: "ulvia.cms.observability",
                            digest: admission.digest,
                            installationId: "native",
                            version: "1.0.0",
                        },
                        release: { admission },
                        installation: {
                            installation: {
                                endpoint: "http://docker-only-provider.invalid:5103",
                                providerTokenRef: "private-reference",
                            },
                            observation: { report: { instanceId } },
                        },
                    }),
                });
            }
            if (path === "/gateway/invocations") {
                const input = (await request.json()) as { capabilityId: string; systemServiceId?: string };
                expect(input.capabilityId).toBe("logs.query");
                expect(input.systemServiceId).toBeUndefined();
                return Response.json({ token: "scoped-operator-invocation", instanceId });
            }
            expect(path).toBe("/observability/logs/query");
            return Response.json({
                items: [],
                nextCursor: null,
                from: "2026-10-25T00:00:00.000Z",
                to: "2026-10-26T00:00:00.000Z",
            });
        },
    });
    try {
        const client = new OperatorObservabilityClient(server.url.origin, "private-control-bearer", instanceId);
        expect((await client.query({ service: "cms-edge" })).items).toEqual([]);
        expect(requests).toEqual([
            { path: "/gateway/route", authorization: "Bearer private-control-bearer" },
            { path: "/gateway/invocations", authorization: "Bearer private-control-bearer" },
            { path: "/observability/logs/query", authorization: "Bearer scoped-operator-invocation" },
        ]);
    } finally {
        server.stop(true);
    }
});
