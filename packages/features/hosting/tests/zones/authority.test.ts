import { expect, test } from "bun:test";
import { fixture } from "../fixture";

test("zone claims are canonical, exclusive, replayable and require Control administration", async () => {
    const f = await fixture();
    const results = await Promise.all(Array.from({ length: 16 }, () => f.zones.claim(f.actor, "Demo.Example.")));
    expect(new Set(results.map(({ proof }) => proof.value)).size).toBe(1);
    expect(results[0]!.proof.name).toBe("_ulvia-zone.demo.example");
    expect(results[0]!.zone).toMatchObject({ hostname: "demo.example", state: "pending", revision: 1 });
    await expect(f.zones.claim({ ...f.actor, instanceId: "site-a" }, "foreign.example")).rejects.toMatchObject({
        code: "FORBIDDEN",
    });
    expect(await f.zoneStore.getZone("foreign.example")).toBeNull();
    const original = results[0]!.zone;
    await expect(f.zoneStore.claimZone({ ...original, controlInstanceId: "foreign" })).rejects.toMatchObject({
        code: "CONFLICT",
    });
    expect(await f.zoneStore.getZone(original.hostname)).toEqual(original);
});

test("invalid zones and pagination refuse without creating business state", async () => {
    const f = await fixture();
    for (const hostname of [
        "*.example.com",
        "https://example.com",
        "com",
        "localhost",
        "a.localhost",
        "127.0.0.1",
        "a..com",
        " example.com",
    ]) {
        await expect(f.zones.claim(f.actor, hostname)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    for (const limit of [0, 51, 1.5, NaN]) {
        await expect(f.zones.list(f.actor, null, limit)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    expect((await f.zones.list(f.actor, null, 50)).items).toEqual([]);
});

test("failed DNS, foreign instance and revoked administrator cannot verify or change zones", async () => {
    const f = await fixture();
    const { zone } = await f.zones.claim(f.actor, "demo.example");
    await expect(f.zones.verify(f.actor, zone.hostname, 1)).rejects.toMatchObject({ code: "DOMAIN_UNVERIFIED" });
    expect(await f.zoneStore.getZone(zone.hostname)).toEqual(zone);
    const foreign = { ...f.actor, instanceId: "site-a" };
    for (const action of [
        () => f.zones.verify(foreign, zone.hostname, 1),
        () => f.zones.disable(foreign, zone.hostname, 1),
        () => f.zones.list(foreign, null, 10),
    ]) {
        await expect(action()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    f.setVerified(true);
    f.setProbe(async () => f.setAdmin(false));
    await expect(f.zones.verify(f.actor, zone.hostname, 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await f.zoneStore.getZone(zone.hostname)).toEqual(zone);
});

test("zone verification fences concurrent disable and reclaims rotate the proof", async () => {
    const f = await fixture();
    const first = await f.zones.claim(f.actor, "demo.example");
    f.setVerified(true);
    f.setProbe(async () => {
        await f.zones.disable(f.actor, first.zone.hostname, 1);
    });
    await expect(f.zones.verify(f.actor, first.zone.hostname, 1)).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await f.zoneStore.getZone(first.zone.hostname))!.state).toBe("disabled");
    const next = await f.zones.claim(f.actor, first.zone.hostname);
    expect(next.zone).toMatchObject({ state: "pending", revision: 3 });
    expect(next.proof).not.toEqual(first.proof);
    expect(await f.zones.claim(f.actor, first.zone.hostname)).toEqual(next);
    f.setProbe(async () => {});
    const verified = await f.zones.verify(f.actor, first.zone.hostname, 3);
    expect(verified).toMatchObject({ state: "verified", revision: 4 });
    await expect(f.zones.disable(f.actor, first.zone.hostname, 3)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await f.zoneStore.getZone(first.zone.hostname)).toEqual(verified);
});

test("zone listing is ordered, bounded and excludes another Control identity", async () => {
    const f = await fixture();
    for (const name of ["c", "a", "b"]) {
        await f.zones.claim(f.actor, `${name}.example`);
    }
    await f.zoneStore.claimZone({
        format: "ulvia-hosting-zone/v1",
        hostname: "foreign.example",
        claimId: crypto.randomUUID(),
        controlInstanceId: "foreign",
        state: "pending",
        revision: 1,
    });
    const first = await f.zones.list(f.actor, null, 2);
    expect(first.items.map((zone) => zone.hostname)).toEqual(["a.example", "b.example"]);
    const second = await f.zones.list(f.actor, first.nextCursor, 2);
    expect(second.items.map((zone) => zone.hostname)).toEqual(["c.example"]);
    expect(second.nextCursor).toBeNull();
});
