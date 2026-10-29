import { ControlProviderClient } from "../../../src/runtime/gateway/ControlProviderClient";
import { InstallationsProviderTransport } from "../../../src/runtime/gateway/InstallationsProviderTransport";
import { MACHINE_INSTALLATIONS_CONTRACT } from "../../../src/runtime/gateway/fetchProviderReport";
export function fixture() {
    const calls: { path: string; input: any }[] = [];
    let fail = false;
    let rootless = false;
    let sequence = 0;
    let blockCheck: Promise<void> | undefined;
    const client = new ControlProviderClient(
        new InstallationsProviderTransport(
            "http://control.internal:5103",
            "opaque-control-token-" + "c".repeat(32),
            (async (url, options) => {
                const path = new URL(url.toString()).pathname;
                const input = JSON.parse(String(options?.body));
                calls.push({ path, input });
                if (fail) {
                    return new Response(null, { status: 503 });
                }
                if (path.endsWith("/check")) {
                    await blockCheck;
                    return Response.json({ actor: { kind: "anonymous" }, rootRequestId: crypto.randomUUID() });
                }
                if (path.endsWith("/close")) {
                    return Response.json({ accepted: true });
                }
                return Response.json({
                    token: "signed-provider-token-" + "s".repeat(32),
                    instanceId: "instance:a",
                    delegation: rootless
                        ? null
                        : { ticket: String(++sequence).padStart(43, "a"), expiresAt: Date.now() + 10_000 },
                });
            }) as typeof fetch,
        ),
        undefined,
        MACHINE_INSTALLATIONS_CONTRACT,
    );
    const prepare = (reserveRoot = true) => {
        const requestId = crypto.randomUUID();
        return {
            requestId,
            result: client.prepareGatewayDispatch(
                {
                    actor: { kind: "anonymous" },
                    deadline: Date.now() + 15_000,
                    invocation: {
                        requestId,
                        installationId: "target",
                        contractId: "catalog",
                        contractVersion: "1.0.0",
                        capabilityId: "read",
                    },
                },
                reserveRoot,
            ),
        };
    };
    return {
        client,
        rootless: () => {
            rootless = true;
        },
        calls,
        prepare,
        fail: (value: boolean) => {
            fail = value;
        },
        block: (value: Promise<void>) => {
            blockCheck = value;
        },
    };
}
