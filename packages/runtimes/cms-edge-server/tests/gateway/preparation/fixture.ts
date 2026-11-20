import { expect } from "bun:test";
import { signProviderInvocationToken, verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { gatewayRoute } from "../../../../../../tests/integration/gateway/fixtures";
import { packGatewayRoute } from "@bernouy/cms-gateway/protocol";
import { ControlProviderClient } from "../../../src/runtime/gateway/ControlProviderClient";
import { InstallationsProviderTransport } from "../../../src/runtime/gateway/InstallationsProviderTransport";
import { INSTALLATIONS_CONTRACT } from "../../../src/runtime/gateway/control";
import { createEdgeGateway } from "../../../src/runtime/gateway/createEdgeGateway";

export async function preparedFixture(command = false, settled?: () => void, machine = false, compact = false) {
    const events: string[] = [];
    const requests: string[] = [];
    let outerStatus = 0;
    let stageFailure: "identity" | "audit" | null = null;
    const contract = compact ? INSTALLATIONS_CONTRACT : { ...INSTALLATIONS_CONTRACT, version: "1.5.0" };
    const preparations: Record<string, any>[] = [];
    const secret = "signed-provider-" + "p".repeat(40);
    let wrongAudience = false;
    let status = 200;
    let businessFails = false;
    const backend = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch(request) {
            events.push("business");
            if (businessFails) {
                return new Response(null, { status: 503 });
            }
            const token = request.headers.get("authorization")!.slice(7);
            expect(token).not.toBe("control-token-" + "c".repeat(40));
            expect(verifyProviderInvocationToken(token, secret)).toMatchObject({
                ...(machine ? { sourceInstallationId: "verified-source" } : { subjectId: "alias" }),
                instanceId: "instance:account-a",
            });
            expect(verifyProviderInvocationToken(token, secret).requestId).toBe(
                request.headers.get("x-ulvia-request-id"),
            );
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
                requests.push(path);
                const input = JSON.parse(String(init?.body));
                if (path === "/gateway/route-snapshot") {
                    return Response.json(await packGatewayRoute(route, input.known));
                }
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
                if (
                    path !==
                    (machine
                        ? "/gateway/providers/prepare"
                        : compact && command
                          ? "/gateway/commands/prepare"
                          : "/gateway/dispatch/prepare")
                ) {
                    throw new Error("Unexpected control request: " + path);
                }
                expect(new Headers(init?.headers).get("x-ulvia-contract-version")).toBe(contract.version);
                if (compact && command && outerStatus) {
                    return new Response(null, { status: outerStatus });
                }
                if (compact && command) {
                    events.push("identity");
                    if (stageFailure === "identity") {
                        return Response.json({ prepared: null, failure: { stage: "identity", status: 503 } });
                    }
                    events.push("started");
                    if (stageFailure === "audit") {
                        return Response.json({ prepared: null, failure: { stage: "audit", status: 503 } });
                    }
                }
                events.push(machine ? "machine-prepare" : "prepare");
                preparations.push(input);
                if (status !== 200) {
                    return compact && command
                        ? Response.json({ prepared: null, failure: { stage: "preparation", status } })
                        : new Response(null, { status });
                }
                const instanceId = wrongAudience ? "instance:another" : "instance:account-a";
                const now = Math.floor(Date.now() / 1000);
                const prepared = {
                    instanceId,
                    ...(machine ? { sourceInstallationId: "verified-source" } : {}),
                    token: signProviderInvocationToken(secret, {
                        version: 1,
                        requestId: input.invocation.requestId,
                        ...(input.invocation.trace ? { trace: input.invocation.trace } : {}),
                        instanceId,
                        contractId: "ulvia/catalog",
                        contractVersion: "1.0.0",
                        capabilityId: "item.list",
                        ...(machine ? { sourceInstallationId: "verified-source" } : { subjectId: "alias" }),
                        issuedAt: now,
                        expiresAt: now + 30,
                    }),
                    delegation: machine ? null : { ticket: "t".repeat(43), expiresAt: Date.now() + 10_000 },
                };
                return Response.json(compact && command ? { prepared, failure: null } : prepared);
            }) as typeof fetch,
        );
        const gateway = createEdgeGateway(
            new ControlProviderClient(transport, undefined, contract),
            undefined,
            settled,
        );
        const invoke = () =>
            gateway.invoker.invoke({
                siteId: "default",
                contractId: "ulvia/catalog",
                capabilityId: "item.list",
                input: { term: "test" },
                actor: { kind: "administrator", subjectId: "cms-user", authorizationRevision: 1 },
            });
        return {
            gateway,
            events,
            requests,
            rejectBeforeStart: (status: number) => {
                outerStatus = status;
            },
            failStage: (stage: "identity" | "audit") => {
                stageFailure = stage;
            },
            preparations,
            invoke,
            failBusiness: () => {
                businessFails = true;
            },
            close: () => backend.stop(true),
            wrongAudience: () => {
                wrongAudience = true;
            },
            reject: (code: number) => {
                status = code;
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
