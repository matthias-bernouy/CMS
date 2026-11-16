import { expect, test } from "bun:test";
import { ZoneRegistry, DomainAdmissionPolicy } from "@bernouy/hosting";
import { fixture } from "../fixture";

test("verified zones admit aliases on label boundaries and disable leaves existing routes intact", async () => {
    const f = await fixture();
    await f.zones.claim(f.actor, "demo.example");
    const pending = await f.domains.claim(f.actor, "site-a", "https://before.demo.example");
    expect(pending.domain.state).toBe("pending");
    f.setVerified(true);
    await f.zones.verify(f.actor, "demo.example", 1);
    for (const hostname of ["demo.example", "artisan.demo.example", "deep.artisan.demo.example"]) {
        const { domain } = await f.domains.claim(f.actor, "site-a", `https://${hostname}`);
        expect(domain).toMatchObject({ state: "verified", tls: "pending" });
    }
    for (const hostname of ["fakedemo.example", "demo.example.attacker.test", "outside.example"]) {
        expect((await f.domains.claim(f.actor, "site-b", `https://${hostname}`)).domain.state).toBe("pending");
    }
    expect((await f.store.getDomain("before.demo.example"))!.state).toBe("pending");
    const domain = await f.domains.recordTls("artisan.demo.example", 1, "ready");
    await f.zones.disable(f.actor, "demo.example", 2);
    expect(await f.store.getDomain(domain.hostname)).toEqual(domain);
    expect(await f.domains.resolve(domain.hostname)).not.toBeNull();
    expect((await f.domains.claim(f.actor, "site-a", "https://later.demo.example")).domain.state).toBe("pending");
});

test("zone proofs cannot be reused as individual domain proofs or across Control identities", async () => {
    const f = await fixture();
    const published = new Map<string, string>();
    const registry = new ZoneRegistry(
        f.zoneStore,
        f.authority,
        "a".repeat(32),
        async (name, value) => published.get(name) === value,
    );
    const { proof, zone } = await registry.claim(f.actor, "demo.example");
    const domain = await f.domains.claim(f.actor, "site-a", "https://demo.example");
    published.set(proof.name, domain.proof.value);
    await expect(registry.verify(f.actor, zone.hostname, 1)).rejects.toMatchObject({ code: "DOMAIN_UNVERIFIED" });
    published.set(proof.name, proof.value);
    await registry.verify(f.actor, zone.hostname, 1);
    await registry.disable(f.actor, zone.hostname, 2);
    const reclaimed = await registry.claim(f.actor, zone.hostname);
    await expect(registry.verify(f.actor, zone.hostname, reclaimed.zone.revision)).rejects.toMatchObject({
        code: "DOMAIN_UNVERIFIED",
    });
    expect((await f.zoneStore.getZone(zone.hostname))!.state).toBe("pending");
    const foreign = await f.zoneStore.claimZone({ ...zone, hostname: "foreign.example", controlInstanceId: "foreign" });
    await f.zoneStore.replaceZone(1, { ...foreign, state: "verified", revision: 2 });
    expect(await registry.admits(f.actor, "a.foreign.example")).toBe(false);
});

test("admission uses one bounded lookup without caching and routing never consults zones", async () => {
    const f = await fixture();
    await f.zones.claim(f.actor, "demo.example");
    f.setVerified(true);
    await f.zones.verify(f.actor, "demo.example", 1);
    const candidates: string[][] = [];
    const find = f.zoneStore.findVerifiedZone.bind(f.zoneStore);
    f.zoneStore.findVerifiedZone = async (id, names) => {
        candidates.push([...names]);
        return find(id, names);
    };
    const registry = new ZoneRegistry(
        {
            ...f.zoneStore,
            getZone: (name) => f.zoneStore.getZone(name),
            claimZone: (zone) => f.zoneStore.claimZone(zone),
            replaceZone: (revision, zone) => f.zoneStore.replaceZone(revision, zone),
            listZones: (input) => f.zoneStore.listZones(input),
            findVerifiedZone: (id, names) => f.zoneStore.findVerifiedZone(id, names),
        },
        f.authority,
        "a".repeat(32),
        async () => true,
    );
    const admission = new DomainAdmissionPolicy([], false, registry);
    expect((await admission.admit("https://a.b.demo.example", f.actor)).managed).toBe(true);
    expect(candidates).toEqual([["a.b.demo.example", "b.demo.example", "demo.example"]]);
    await f.zones.disable(f.actor, "demo.example", 2);
    expect((await admission.admit("https://a.b.demo.example", f.actor)).managed).toBe(false);
    const max = `${"a.".repeat(126)}a`;
    await registry.admits(f.actor, max);
    expect(candidates.at(-1)).toHaveLength(126);
    await f.domains.resolve("unknown.demo.example");
    expect(candidates).toHaveLength(3);
});
