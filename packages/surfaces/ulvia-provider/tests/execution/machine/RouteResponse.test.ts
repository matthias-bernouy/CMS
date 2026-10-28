import { expect, test } from "bun:test";
import { routeResponse } from "../../../src/transport/routeResponse";

test("route compression preserves complete JSON and no-store semantics, honors negotiation and shrinks the payload", async () => {
    const body = {
        route: JSON.stringify({
            contracts: Array(100).fill({ id: "content", description: "immutable catalogue metadata" }),
        }),
    };
    const json = JSON.stringify(body);
    const compressed = await routeResponse(
        new Request("https://provider.test/gateway/route", { headers: { "accept-encoding": "gzip" } }),
        Response.json(body, { headers: { "cache-control": "no-store" } }),
    );
    expect(compressed.headers.get("cache-control")).toBe("no-store");
    expect(compressed.headers.get("content-encoding")).toBe("gzip");
    const bytes = await compressed.arrayBuffer();
    expect(bytes.byteLength).toBeLessThan(json.length / 4);
    const decoded = await new Response(new Response(bytes).body!.pipeThrough(new DecompressionStream("gzip"))).json();
    expect(decoded).toEqual(body);
    const plain = await routeResponse(
        new Request("https://provider.test/gateway/route", { headers: { "accept-encoding": "gzip;q=0" } }),
        Response.json(body),
    );
    expect(plain.headers.has("content-encoding")).toBe(false);
    expect(await plain.json()).toEqual(body);
});
