import { expect, test } from "bun:test";
import { fetchProviderHandshake } from "../../src/runtime/gateway/fetchProviderReport";
import { ProviderKernelTransport } from "../../src/runtime/provider/ProviderKernelTransport";

test("provider handshakes accept the configured private service endpoint", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const report = providerReport();
    const handshake = {
        protocol: "ulvia-kernel-provider/v1",
        instance: { id: report.instanceId, status: "ready", revision: 3 },
        activeProfile: { id: "ulvia.official", version: "1.0.0" },
        contentRevision: "revision:".padEnd(1_024, "x"),
        runtime: report,
    };
    const endpoint = "http://ulvia-provider:5103";
    const token = "provider-token-at-least-twenty";
    const transport = new ProviderKernelTransport(endpoint, token, (async (url, init) => {
        requests.push({ url: url.toString(), init });
        return Response.json(handshake);
    }) as typeof fetch);
    const result = await fetchProviderHandshake(transport);

    expect(result).toEqual(handshake);
    expect(requests[0]?.url).toBe("http://ulvia-provider:5103/ulvia/kernel/v1/handshake");
    expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe(`Bearer ${token}`);
    expect(() => new ProviderKernelTransport("https://api.provider.example", "invalid")).toThrow(
        "Invalid provider token",
    );
});

test("provider handshakes reject incomplete runtime reports and mismatched instances", async () => {
    const report = providerReport();
    const handshake = {
        protocol: "ulvia-kernel-provider/v1",
        instance: { id: "instance:other", status: "ready", revision: 1 },
        activeProfile: { id: "ulvia.official", version: "1.0.0" },
        contentRevision: 1,
        runtime: report,
    };
    const endpoint = "http://ulvia-provider:5103";
    const token = "provider-token-at-least-twenty";
    const transport = new ProviderKernelTransport(endpoint, token, (async () =>
        Response.json(handshake)) as typeof fetch);

    await expect(fetchProviderHandshake(transport)).rejects.toThrow("Provider handshake is invalid");
    handshake.instance.id = report.instanceId;
    handshake.runtime = {} as ReturnType<typeof providerReport>;
    await expect(fetchProviderHandshake(transport)).rejects.toThrow("Provider handshake is invalid");
    handshake.runtime = report;
    handshake.activeProfile.version = "1.0.0-01";
    await expect(fetchProviderHandshake(transport)).rejects.toThrow("Provider handshake is invalid");
});

test("provider forwarding preserves streaming and removes hop-by-hop headers", async () => {
    let forwarded: RequestInit | undefined;
    const transport = new ProviderKernelTransport(
        "http://ulvia-provider:5103",
        "provider-token-at-least-twenty",
        (async (_url, init) => {
            forwarded = init;
            return new Response("stream", {
                headers: { connection: "close", "content-length": "6", "x-result": "ok" },
            });
        }) as typeof fetch,
    );
    const request = new Request("http://kernel.test/resource", {
        headers: {
            authorization: "Bearer actor",
            connection: "keep-alive, x-remove",
            host: "kernel.test",
            "x-remove": "private-hop",
            "x-ulvia-original-origin": "https://spoofed.test",
        },
    });

    const response = transport.response(await transport.forward("/ulvia/kernel/v1/resource", request));
    const headers = new Headers(forwarded?.headers);
    expect(headers.get("authorization")).toBe("Bearer provider-token-at-least-twenty");
    expect(headers.get("x-ulvia-actor-authorization")).toBe("Bearer actor");
    expect(headers.get("x-ulvia-original-origin")).toBe("http://kernel.test");
    expect(headers.has("connection")).toBe(false);
    expect(headers.has("host")).toBe(false);
    expect(headers.has("x-remove")).toBe(false);
    expect(forwarded?.signal).toBe(request.signal);
    expect(response.headers.has("connection")).toBe(false);
    expect(response.headers.get("content-length")).toBe("6");
    expect(await response.text()).toBe("stream");
});

function providerReport() {
    return {
        protocol: "ulvia-provider/v1",
        providerId: "ulvia.example",
        instanceId: "instance:account-a",
        account: { id: "account-a", label: "Account A" },
        buildVersion: "1.0.0",
        manifest: { version: "1.0.0", digest: `sha256:${"a".repeat(64)}` },
        implementations: [
            {
                contractId: "catalog.items",
                version: "1.0.0",
                digest: `sha256:${"b".repeat(64)}`,
                status: "ready",
            },
        ],
    };
}
