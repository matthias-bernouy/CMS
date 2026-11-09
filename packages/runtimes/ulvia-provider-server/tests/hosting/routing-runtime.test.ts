import { expect, test } from "bun:test";
import { BunRunner } from "@bernouy/http-runner";
import { createMemoryLogger } from "@bernouy/logging/testing";
import { RoutingAuthority } from "@bernouy/hosting/routing";
import { signProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { UlviaProvider } from "@bernouy/ulvia-provider";
import { createRoutingRuntime } from "../../src/runtime/instances/system/hosting/routingRuntime";
import { SystemBootstrap } from "../../src/runtime/instances/system/execution/SystemBootstrap";
import { bundledBootstrapSources } from "../../src/runtime/instances/system/bootstrap";

test("the admitted host routing runtime authenticates only its machine and returns no tenant fallback", async () => {
    const secret = "dedicated-edge-routing-secret".repeat(2);
    const authority = new RoutingAuthority(
        { resolve: async () => null },
        "private-routing-lease-secret".repeat(2),
        async () => "11111111-1111-4111-8111-111111111111",
    );
    const machine = await createRoutingRuntime(new SystemBootstrap(bundledBootstrapSources()), authority, secret);
    const logs = createMemoryLogger({ service: "routing-test" });
    const runner = new BunRunner({ logger: logs.logger });
    new UlviaProvider(runner, {
        logger: logs.logger,
        authenticateControlToken: async () => null,
        authenticateInvocationToken: machine.authenticate,
    });
    const now = Math.floor(Date.now() / 1000);
    const requestId = crypto.randomUUID();
    const token = signProviderInvocationToken(secret, {
        version: 1,
        requestId,
        instanceId: "hosting:installation",
        contractId: "ulvia/provider.routing",
        contractVersion: "1.0.0",
        capabilityId: "domains.resolve",
        systemServiceId: "cms-edge",
        issuedAt: now,
        expiresAt: now + 30,
    });
    const response = await runner.handle(
        new Request("http://provider.local/hosting/routing/resolve", {
            method: "QUERY",
            headers: {
                authorization: `Bearer ${token}`,
                "x-ulvia-request-id": requestId,
                "content-type": "application/json",
            },
            body: '{"hostname":"unknown.localhost"}',
        }),
    );
    expect(response.status, JSON.stringify(logs.records)).toBe(200);
    expect(await response.json()).toBeNull();
});
