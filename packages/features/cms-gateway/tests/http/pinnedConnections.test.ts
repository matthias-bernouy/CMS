import { expect, test } from "bun:test";
import { sendPinnedHttpRequest } from "cms-gateway/invocation/node-http/nodeHttpRequest";
import { pinnedHttpAgent, pinnedHttpsAgent } from "cms-gateway/invocation/node-http/pinnedAgents";
import { createServer } from "node:http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";

test("pooled pinned sockets retain fresh DNS and credentials and separate Host authorities", async () => {
    const server = createServer((request, response) => {
        response.setHeader("Content-Type", "application/json");
        response.end(
            JSON.stringify({
                port: request.socket.remotePort,
                host: request.headers.host,
                authorization: request.headers.authorization,
            }),
        );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("Expected a TCP listener");
    }
    let dnsReads = 0;
    let authorizations = 0;
    let rejectedDns = false;
    let token = "instance-a-credential";
    const network = () =>
        new NodeGatewayHttpNetwork({
            allowPrivateAddresses: true,
            resolveAddresses: async () => {
                dnsReads++;
                if (rejectedDns) {
                    throw new Error("DNS unavailable");
                }
                return [{ address: "127.0.0.1", family: 4 }];
            },
            authorize: async () => {
                authorizations++;
                return { token };
            },
        });
    const invoke = async (hostname: string, instanceId: string) => {
        const result = await network().exchange({
            origin: `http://${hostname}:${address.port}`,
            pathAndQuery: "/read",
            method: "GET",
            headers: {},
            requestId: crypto.randomUUID(),
            providerTokenRef: "opaque-reference",
            authentication: {
                kind: "capability",
                instanceId,
                contractId: "catalog",
                contractVersion: "1.0.0",
                capabilityId: "read",
            },
            signal: AbortSignal.timeout(5000),
        });
        const body = (await result.json()) as { port: number; host: string; authorization: string };
        await Bun.sleep(1);
        return body;
    };
    try {
        const first = await invoke("127.0.0.1", "instance-a");
        token = "instance-b-rotated-credential";
        const second = await invoke("127.0.0.1", "instance-b");
        expect(second.port).toBe(first.port);
        expect(second.authorization).toBe("Bearer instance-b-rotated-credential");
        expect(first.authorization).toBe("Bearer instance-a-credential");
        // Exercise the lower pinned transport for a second Host on this test-only loopback listener.
        const response = await sendPinnedHttpRequest({
            url: new URL(`http://beta.test:${address.port}/read`),
            address: { address: "127.0.0.1", family: 4 },
            method: "GET",
            headers: {},
            signal: AbortSignal.timeout(5000),
        });
        const otherOrigin = (await response.json()) as { port: number; host: string };

        expect(otherOrigin.port).not.toBe(first.port);
        expect(otherOrigin.host).toBe(`beta.test:${address.port}`);
        expect(dnsReads).toBe(2);
        expect(authorizations).toBe(2);
        rejectedDns = true;
        await expect(invoke("127.0.0.1", "instance-a")).rejects.toThrow("DNS unavailable");
        expect(authorizations).toBe(2);
    } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
});

test("HTTP and HTTPS pool keys separate pinned IPs within the same address family", () => {
    for (const agent of [pinnedHttpAgent, pinnedHttpsAgent]) {
        const options = {
            host: "192.0.2.1",
            family: 4,
            port: 443,
            headers: { host: "same-origin.test:443" },
            servername: "same-origin.test",
        };
        expect(agent.getName(options)).not.toBe(agent.getName({ ...options, host: "192.0.2.2" }));
    }
});

test("a changed pinned IP cannot reuse a socket opened for the previous DNS answer", async () => {
    const first = createServer((_request, response) => response.end("first-address"));
    const second = createServer((_request, response) => response.end("second-address"));
    const listen = (server: ReturnType<typeof createServer>, host: string, port: number) =>
        new Promise<void>((resolve, reject) => {
            server.once("error", reject);
            server.listen(port, host, resolve);
        });
    try {
        await listen(first, "127.0.0.1", 0);
        const address = first.address();
        if (!address || typeof address === "string") {
            throw new Error("Expected a TCP listener");
        }
        // Both loopbacks exist without configuring a privileged IPv4 alias on macOS.
        await listen(second, "::1", address.port);
        const read = async (ip: string, family: 4 | 6) => {
            const response = await sendPinnedHttpRequest({
                url: new URL(`http://same-origin.test:${address.port}/read`),
                address: { address: ip, family },
                method: "GET",
                headers: {},
                signal: AbortSignal.timeout(5000),
            });
            const value = await response.text();
            await Bun.sleep(1);
            return value;
        };
        expect(await read("127.0.0.1", 4)).toBe("first-address");
        expect(await read("::1", 6)).toBe("second-address");
        expect(await read("127.0.0.1", 4)).toBe("first-address");
    } finally {
        first.closeAllConnections();
        second.closeAllConnections();
        await Promise.all(
            [first, second].map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
        );
    }
});
