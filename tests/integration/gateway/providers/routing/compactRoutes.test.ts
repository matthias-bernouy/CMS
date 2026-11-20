import { expect, test } from "bun:test";
import { GatewayRouteCodec, packGatewayRoute, packGatewayContract } from "@bernouy/cms-gateway/protocol";
import { gatewayRoute } from "../../fixtures";

test("compact routes round-trip the complete admitted representation and every mutable field", async () => {
    const route = await gatewayRoute({ mcp: true });
    const codec = new GatewayRouteCodec();
    const first = codec.definitions.lease();
    const packet = await packGatewayRoute(route, first.known);
    expect(packet.definitions).toHaveLength(2);
    const decoded = await codec.route(packet, first);
    expect(JSON.stringify(decoded.route)).toBe(JSON.stringify(route));
    expect(decoded.characters).toBe(JSON.stringify(route).length);
    expect(Object.isFrozen(decoded.route.requestedRelease.admission.bindings)).toBe(true);
    first.release();
    const second = codec.definitions.lease();
    const changed = {
        ...route,
        installation: {
            ...route.installation,
            revision: 3,
            installation: { ...route.installation.installation, status: "disabled" as const },
        },
    };
    const warm = await packGatewayRoute(changed, second.known);
    expect(warm.definitions).toHaveLength(0);
    expect(JSON.stringify((await codec.route(warm, second)).route)).toBe(JSON.stringify(changed));
    expect(warm.snapshot.length).toBeLessThan(JSON.stringify(changed).length);
    expect(codec.definitions.snapshot().leased).toBe(0);
    second.release();
    second.release();
    expect(codec.definitions.snapshot().leased).toBe(0);
});

test("unknown, altered, duplicate and wrong-kind definitions fail before cache retention", async () => {
    const route = await gatewayRoute();
    const packet = await packGatewayRoute(route, []);
    const cases = [
        { ...packet, definitions: [] },
        {
            ...packet,
            definitions: packet.definitions.map((entry, i) => (i ? entry : { ...entry, json: entry.json + " " })),
        },
        { ...packet, definitions: [...packet.definitions, packet.definitions[0]!] },
        { ...packet, snapshot: packet.snapshot.replace(packet.definitions[0]!.key, packet.definitions[1]!.key) },
    ];
    for (const value of cases) {
        const codec = new GatewayRouteCodec();
        const lease = codec.definitions.lease();
        await expect(codec.route(value, lease)).rejects.toBeInstanceOf(TypeError);
        expect(codec.definitions.snapshot()).toEqual({ entries: 0, bytes: 0, leased: 0 });
        lease.release();
    }
    const codec = new GatewayRouteCodec();
    const lease = codec.definitions.lease();
    expect(await codec.contract(await packGatewayContract(null, []), lease)).toBeNull();
    await expect(
        codec.contract({ found: false, key: packet.definitions[0]!.key, definitions: [] }, lease),
    ).rejects.toThrow();
    lease.release();
});

test("advertised leases survive concurrent saturation; oversize admissions are usable without retention", async () => {
    const first = await gatewayRoute({ contractId: "ulvia/first", mcp: true });
    const second = await gatewayRoute({ contractId: "ulvia/second", mcp: true });
    const codec = new GatewayRouteCodec(1);
    const fill = codec.definitions.lease();
    expect(await codec.contract(await packGatewayContract(first.release.admission, []), fill)).toEqual(
        first.release.admission,
    );
    fill.release();
    const pinned = codec.definitions.lease();
    const concurrent = codec.definitions.lease();
    const next = await packGatewayContract(second.release.admission, concurrent.known);
    expect(await codec.contract(next, concurrent)).toEqual(second.release.admission);
    concurrent.release();
    expect(codec.definitions.snapshot().entries).toBe(1);
    expect(await codec.contract(await packGatewayContract(first.release.admission, pinned.known), pinned)).toEqual(
        first.release.admission,
    );
    pinned.release();
    const latest = codec.definitions.lease();
    await codec.contract(next, latest);
    latest.release();
    const retained = codec.definitions.lease();
    expect(retained.known).toEqual([next.key]);
    retained.release();
    const tiny = new GatewayRouteCodec(1, 1);
    const lease = tiny.definitions.lease();
    expect((await tiny.route(await packGatewayRoute(first, []), lease)).route).toEqual(first);
    expect(tiny.definitions.snapshot()).toEqual({ entries: 0, bytes: 0, leased: 0 });
    lease.release();
    const isolated = new GatewayRouteCodec();
    const other = isolated.definitions.lease();
    await expect(isolated.contract({ found: true, key: next.key, definitions: [] }, other)).rejects.toThrow(
        "unknown definition",
    );
    other.release();
});
