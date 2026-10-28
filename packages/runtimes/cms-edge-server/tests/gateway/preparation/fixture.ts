import { expect } from "bun:test";
import { signProviderInvocationToken, verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { gatewayRoute } from "../../../../../features/cms-gateway/tests/fixtures";
import { ControlProviderClient } from "../../../src/runtime/gateway/ControlProviderClient";
import { InstallationsProviderTransport } from "../../../src/runtime/gateway/InstallationsProviderTransport";
import { PREPARED_INSTALLATIONS_CONTRACT } from "../../../src/runtime/gateway/fetchProviderReport";
import { createEdgeGateway } from "../../../src/runtime/gateway/createEdgeGateway";

export async function preparedFixture(command = false) {
    const events: string[] = [];
    const preparations: Record<string, any>[] = [];
    const secret = "signed-provider-" + "p".repeat(40);
    let wrongAudience = false;
    let status = 200;
    const backend = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch(request) {
            events.push("business");
            const token = request.headers.get("authorization")!.slice(7);
            expect(token).not.toBe("control-token-" + "c".repeat(40));
            expect(verifyProviderInvocationToken(token, secret)).toMatchObject({
                subjectId: "alias",
                instanceId: "instance:account-a",
            });
            return Response.json({ items: ["authorized"] });
        },
    });
    try {
        const route = structuredClone(
            await gatewayRoute({
                endpoint: backend.url.origin,
                access: "admin",
                ...(command
                    ? { behavior: { sensitive: false, effect: "command", execution: "sync", idempotency: "natural" } }
                    : {}),
            }),
        );
        route.selection.siteId = "default";
        route.installation.installation.siteId = "default";
        route.installation.observation!.observedAt = new Date().toISOString();
        const transport = new InstallationsProviderTransport(
            "http://control.internal:5103",
            "control-token-" + "c".repeat(40),
            (async (url, init) => {
                const path = new URL(url.toString()).pathname;
                const input = JSON.parse(String(init?.body));
                if (path === "/gateway/route") {
                    return Response.json({ route: JSON.stringify(route) });
                }
                if (path === "/gateway/identity") {
                    events.push("identity");
                    return Response.json({ providerSubjectId: "alias" });
                }
                if (path === "/gateway/audit") {
                    events.push(JSON.parse(input.event).stage);
                    return Response.json({ accepted: true });
                }
                if (path === "/gateway/delegations/close") {
                    events.push("close");
                    return Response.json({ accepted: true });
                }
                if (path !== "/gateway/dispatch/prepare") {
                    throw new Error("Unexpected control request: " + path);
                }
                expect(new Headers(init?.headers).get("x-ulvia-contract-version")).toBe("1.1.0");
                events.push("prepare");
                preparations.push(input);
                if (status !== 200) {
                    return new Response(null, { status });
                }
                const instanceId = wrongAudience ? "instance:another" : "instance:account-a";
                const now = Math.floor(Date.now() / 1000);
                return Response.json({
                    instanceId,
                    token: signProviderInvocationToken(secret, {
                        version: 1,
                        requestId: input.invocation.requestId,
                        instanceId,
                        contractId: "catalog",
                        contractVersion: "1.0.0",
                        capabilityId: "item.list",
                        subjectId: "alias",
                        issuedAt: now,
                        expiresAt: now + 30,
                    }),
                    delegation: { ticket: "t".repeat(43), expiresAt: Date.now() + 10_000 },
                });
            }) as typeof fetch,
        );
        const gateway = createEdgeGateway(
            new ControlProviderClient(transport, undefined, PREPARED_INSTALLATIONS_CONTRACT),
        );
        const invoke = () =>
            gateway.invoker.invoke({
                siteId: "default",
                contractId: "catalog",
                capabilityId: "item.list",
                input: { term: "test" },
                actor: { kind: "administrator", subjectId: "cms-user", authorizationRevision: 1 },
            });
        return {
            events,
            preparations,
            invoke,
            close: () => backend.stop(true),
            wrongAudience: () => {
                wrongAudience = true;
            },
            deny: () => {
                status = 403;
            },
        };
    } catch (error) {
        backend.stop(true);
        throw error;
    }
}
