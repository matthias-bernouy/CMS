import { expect, test } from "bun:test";
import { Resolver } from "node:dns/promises";
import { randomBytes } from "node:crypto";
import { controlledDns } from "./server";
import { dnsControl } from "./client";
import { dnsQuestion, dnsReply } from "./wire";
import { dnsState, DNS_LIMIT } from "./state";

test("the controlled DNS service answers real UDP TXT/A lookups, bounds bodies and refuses foreign control", async () => {
    const key = randomBytes(32).toString("base64url");
    const server = await controlledDns({ hostname: "127.0.0.1", dnsPort: 0, httpPort: 0, key });
    const control = dnsControl(server.url, key);
    const resolver = new Resolver({ timeout: 1000, tries: 1 });
    resolver.setServers([`127.0.0.1:${server.dnsPort}`]);
    try {
        const name = "_ulvia.zone.performance.test";
        await expect(resolver.resolveTxt(name)).rejects.toThrow();
        await control.put(name, "proof".repeat(80));
        // The service emits one RR. Bun exposes its character-strings as separate entries.
        expect((await resolver.resolveTxt(name)).flat().join("")).toBe("proof".repeat(80));
        const counts = await control.counts(name);
        expect(counts.requests).toBe(2);
        expect(counts.requestBytes).toBeGreaterThan(0);
        expect(counts.responseBytes).toBeGreaterThan(counts.requestBytes);
        await control.put("target.performance.test", "127.0.0.1", "A");
        expect(await resolver.resolve4("target.performance.test")).toEqual(["127.0.0.1"]);
        await expect(resolver.resolve6("target.performance.test")).rejects.toThrow();
        expect((await control.counts("target.performance.test", "A")).requests).toBe(1);
        const ipv6 = await control.counts("target.performance.test", "AAAA");
        expect(ipv6.requests).toBe(1);
        expect(ipv6.requestBytes).toBeGreaterThan(0);
        expect(ipv6.responseBytes).toBeGreaterThan(0);
        await control.remove("target.performance.test", "AAAA");
        expect((await control.counts("target.performance.test", "AAAA")).requests).toBe(0);
        expect(await resolver.resolve4("target.performance.test")).toEqual(["127.0.0.1"]);
        await expect(dnsControl(server.url, "wrong").put(name, "replacement")).rejects.toThrow(
            "fixture-dns-control-refused",
        );
        expect((await resolver.resolveTxt(name)).flat().join("")).toBe("proof".repeat(80));
        await control.remove(name);
        await expect(resolver.resolveTxt(name)).rejects.toThrow();
        await expect(control.put("outside.example.com", "forbidden")).rejects.toThrow();
    } finally {
        resolver.cancel();
        await server.close();
    }
});

test("DNS parser and fixture state refuse malformed packets and unbounded records", () => {
    expect(dnsQuestion(Buffer.alloc(12))).toBeNull();
    const compressed = Buffer.alloc(18);
    compressed.writeUInt16BE(1, 4);
    compressed[12] = 0xc0;
    expect(dnsQuestion(compressed)).toBeNull();
    const state = dnsState();
    expect(() => state.put({ name: "a.performance.test", type: "A", value: "999.0.0.1" })).toThrow();
    expect(() => state.put({ name: "a.performance.test", type: "TXT", value: "x".repeat(1025) })).toThrow();
    for (let index = 0; index < DNS_LIMIT; index++) {
        state.put({ name: `record-${index}.performance.test`, type: "TXT", value: "bounded" });
    }
    expect(() => state.put({ name: "overflow.performance.test", type: "TXT", value: "refused" })).toThrow();
    state.put({ name: "record-0.performance.test", type: "TXT", value: "replacement" });
    expect(state.get("RECORD-0.PERFORMANCE.TEST", 16)?.value).toBe("replacement");
});

test("an existing name without the requested record type returns authoritative NODATA rather than NXDOMAIN", () => {
    const header = Buffer.alloc(12);
    header.writeUInt16BE(1, 4);
    const name = "target.performance.test"
        .split(".")
        .flatMap((label) => [Buffer.from([label.length]), Buffer.from(label)]);
    const question = Buffer.concat([header, ...name, Buffer.from([0, 0, 28, 0, 1])]);
    const parsed = dnsQuestion(question);
    expect(parsed?.type).toBe(28);
    const response = dnsReply(question, parsed!, undefined, true);
    expect(response.readUInt16BE(2) & 15).toBe(0);
    expect(response.readUInt16BE(6)).toBe(0);
    expect(response.length).toBe(question.length);
});

test("a refused DNS bind releases the failed fixture and leaves the existing service reachable", async () => {
    const key = "fixture-" + "x".repeat(40);
    const first = await controlledDns({ hostname: "127.0.0.1", dnsPort: 0, httpPort: 0, key });
    try {
        await expect(
            controlledDns({ hostname: "127.0.0.1", dnsPort: first.dnsPort, httpPort: 0, key }),
        ).rejects.toThrow();
        const ready = await fetch(`${first.url}/readyz`);
        expect(ready.status).toBe(200);
        await ready.body?.cancel();
    } finally {
        await first.close();
    }
});
