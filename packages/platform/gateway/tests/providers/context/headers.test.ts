import { expect, test } from "bun:test";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";

test("existing admitted header bindings coexist with identical common metadata and reject contradictions", async () => {
    let sends = 0;
    const network = new NodeGatewayHttpNetwork({
        resolveToken: async () => "x".repeat(40),
        resolveAddresses: async () => [{ address: "93.184.216.34", family: 4 }],
        sendPinned: async (request) => {
            sends++;
            expect(request.headers.range).toBe("bytes=0-1");
            return new Response("ok");
        },
    });
    const request = {
        origin: "https://provider.example",
        pathAndQuery: "/read",
        method: "GET",
        headers: { range: "bytes=0-1" },
        requestContext: { headers: { range: "bytes=0-1" } },
        requestId: crypto.randomUUID(),
        providerTokenRef: "ref",
        authentication: {
            kind: "capability" as const,
            instanceId: "instance",
            contractId: "example.official/example",
            contractVersion: "1.0.0",
            capabilityId: "read",
        },
        signal: new AbortController().signal,
    };
    expect(await (await network.exchange(request)).text()).toBe("ok");
    await expect(network.exchange({ ...request, requestContext: { headers: { range: "bytes=2-3" } } })).rejects.toThrow(
        "collides",
    );
    expect(sends).toBe(1);
});
