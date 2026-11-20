import { expect, test } from "bun:test";
import { ControlProviderClient } from "../../../src/runtime/gateway/ControlProviderClient";
import { InstallationsProviderTransport } from "../../../src/runtime/gateway/InstallationsProviderTransport";
import { INSTALLATIONS_CONTRACT, installationsControlContract } from "../../../src/runtime/gateway/control";
import { packGatewayRoute } from "@bernouy/cms-gateway/protocol";
import { gatewayRoute } from "../../../../../../tests/integration/gateway/fixtures";

test("negotiated compact routes share exact definitions while reading mutable authority again, without retries", async () => {
    let route = await gatewayRoute();
    let fail = false;
    const calls: { path: string; known: string[] }[] = [];
    const control = new ControlProviderClient(
        new InstallationsProviderTransport("http://control.test:5103", "control-token-" + "t".repeat(40), (async (
            url,
            init,
        ) => {
            const input = JSON.parse(String(init?.body));
            calls.push({ path: new URL(url.toString()).pathname, known: input.known });
            const headers = new Headers(init?.headers);
            expect(headers.get("x-ulvia-contract-version")).toBe("1.5.0");
            expect(headers.get("x-ulvia-capability-id")).toBe("gateway.route.snapshot");
            if (fail) {
                return new Response(null, { status: 503 });
            }
            return Response.json(await packGatewayRoute(route, input.known));
        }) as typeof fetch),
    );
    const read = async () => {
        const value = await control.readGatewayRoute("ulvia/catalog");
        if (!value || typeof value === "string") {
            throw new Error("Expected compact route");
        }
        return value.route;
    };
    expect(control.supportsCompactGateway).toBe(true);
    expect(await read()).toEqual(route);
    route = { ...route, installation: { ...route.installation, revision: 3 } };
    expect((await read()).installation.revision).toBe(3);
    expect(calls[0]!.known).toEqual([]);
    expect(calls[1]!.known).toHaveLength(2);
    fail = true;
    await expect(control.readGatewayRoute("ulvia/catalog")).rejects.toMatchObject({ status: 503 });
    expect(calls).toHaveLength(3);
    fail = false;
    await control.readGatewayRoute("ulvia/catalog");
    expect(calls[3]!.known).toHaveLength(2);
});

test("old ready reports negotiate their exact retained 1.4.2 control pin", async () => {
    const route = await gatewayRoute();
    const old = {
        contractId: "ulvia/cms.installations",
        version: "1.4.2",
        digest: "sha256:59f764502bde4b642609b6bd4d0cf3b7d0ba58444972cb48027a8b1ddb2acdf1",
    };
    expect(INSTALLATIONS_CONTRACT.version).toBe("1.5.0");
    const report = {
        ...route.installation.observation!.report,
        implementations: [{ ...old, status: "ready" as const }],
    };
    expect(installationsControlContract(report)).toEqual(old);
    const transport = new InstallationsProviderTransport(
        "http://control.test:5103",
        "control-token-" + "t".repeat(40),
        (async (url) => {
            expect(new URL(url.toString()).pathname).toBe("/gateway/route");
            return Response.json({ route: JSON.stringify(route) });
        }) as typeof fetch,
    );
    const client = new ControlProviderClient(transport, undefined, old);
    expect(client.supportsCompactGateway).toBe(false);
    expect(await client.readGatewayRoute("ulvia/catalog")).toBe(JSON.stringify(route));
});
