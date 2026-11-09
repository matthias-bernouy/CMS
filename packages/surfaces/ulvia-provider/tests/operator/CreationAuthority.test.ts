import { expect, test } from "bun:test";
import { OfficialInstanceProvisioner, assertInstanceCreationAuthority } from "@bernouy/hosting/instances";
import type { InstanceCreationAuthority } from "@bernouy/hosting/instances";
import type { HostingActor } from "@bernouy/hosting";
import { MemoryRegistry, MemoryTransitions, administratorCredentials, instance, target } from "./provisioningFixtures";

const issuer = { kind: "control", actor: { instanceId: "control:one", subjectId: "provider:admin" } } as const;

function fixture(authority: InstanceCreationAuthority = issuer) {
    const registry = new MemoryRegistry({ ...instance(), creationAuthority: structuredClone(authority) });
    const transitions = new MemoryTransitions();
    const calls: string[] = [];
    let authorized = true;
    let opened = 0;
    const worker = target(calls, async () => void calls.push("initialization"));
    const credentials = {
        ...administratorCredentials(),
        authorizeCreation: async (actor: HostingActor) =>
            authorized && actor.instanceId === issuer.actor.instanceId && actor.subjectId === issuer.actor.subjectId,
    };
    const compose = () =>
        new OfficialInstanceProvisioner(
            registry,
            transitions,
            async () => {
                opened++;
                return worker;
            },
            credentials,
        );
    return {
        registry,
        transitions,
        calls,
        worker,
        credentials,
        compose,
        opened: () => opened,
        allow: (value: boolean) => {
            authorized = value;
        },
    };
}

test("revoked or foreign creation issuers refuse before journaling, opening a target or changing instance state", async () => {
    for (const authority of [issuer, { ...issuer, actor: { ...issuer.actor, instanceId: "ordinary:site" } }] as const) {
        const f = fixture(authority);
        if (authority === issuer) {
            f.allow(false);
        }
        const before = structuredClone(await f.registry.get("instance:one"));
        await expect(f.compose().provision("instance:one")).rejects.toMatchObject({ status: 403 });
        expect(await f.registry.get("instance:one")).toEqual(before);
        expect(f.transitions.record).toBeNull();
        expect(f.opened()).toBe(0);
    }
});

test("loading the staged password cannot hide revocation before administrator initialization", async () => {
    const f = fixture();
    let reads = 0;
    const read = f.credentials.read;
    f.credentials.read = async () => {
        reads++;
        f.allow(false);
        return read();
    };
    await expect(f.compose().provision("instance:one")).rejects.toMatchObject({ status: 403 });
    expect(reads).toBe(1);
    expect(f.calls).toEqual(["manifest", "provider", "contracts", "initialization"]);
    expect((await f.registry.get("instance:one"))?.status).toBe("provisioning");
});

test("a replacement worker rechecks the persisted issuer before recovering a queued creation", async () => {
    const f = fixture();
    const claim = f.transitions.claim.bind(f.transitions);
    f.transitions.claim = async () => false;
    await expect(f.compose().provision("instance:one")).rejects.toThrow("already running");
    f.transitions.claim = claim;
    const before = structuredClone(await f.registry.get("instance:one"));
    const journal = structuredClone(f.transitions.record);
    f.allow(false);
    expect(await f.compose().recover()).toBe(1);
    expect(await f.registry.get("instance:one")).toEqual(before);
    expect(f.transitions.record).toMatchObject({
        instanceId: journal!.instanceId,
        completedSteps: journal!.completedSteps,
        status: "failed",
    });
    expect(f.opened()).toBe(0);
});

test("revocation stops subsequent provisioning steps and recovery retains the original issuer", async () => {
    const f = fixture();
    f.worker.importManifest = async () => {
        f.calls.push("manifest");
        f.allow(false);
    };
    const before = structuredClone(await f.registry.get("instance:one"));
    await expect(f.compose().provision("instance:one")).rejects.toMatchObject({ status: 403 });
    expect(f.calls).toEqual(["manifest"]);
    expect(f.transitions.record?.completedSteps).toEqual(["manifest"]);
    expect(await f.registry.get("instance:one")).toEqual(before);
    await expect(f.compose().provision("instance:one")).rejects.toMatchObject({ status: 403 });
    expect(f.calls).toEqual(["manifest"]);
    f.allow(true);
    expect((await f.compose().provision("instance:one")).status).toBe("ready");
    expect(f.calls).toEqual(["manifest", "provider", "contracts", "initialization", "administrator"]);
    expect((await f.registry.get("instance:one"))?.creationAuthority).toEqual(issuer);
});

test("the last step cannot publish readiness after the creator loses authority", async () => {
    const f = fixture();
    f.worker.initializeAdministrator = async () => {
        f.calls.push("administrator");
        f.allow(false);
    };
    await expect(f.compose().provision("instance:one")).rejects.toMatchObject({ status: 403 });
    expect((await f.registry.get("instance:one"))?.status).toBe("provisioning");
    expect(f.transitions.record?.status).toBe("failed");
    const completed = [...f.calls];
    f.allow(true);
    expect((await f.compose().provision("instance:one")).status).toBe("ready");
    expect(f.calls).toEqual(completed);
});

test("completed creation replay reauthorizes before returning a result", async () => {
    const f = fixture();
    const ready = await f.compose().provision("instance:one");
    const journal = structuredClone(f.transitions.record);
    f.allow(false);
    await expect(f.compose().provision("instance:one")).rejects.toMatchObject({ status: 403 });
    expect(await f.registry.get("instance:one")).toEqual(ready);
    expect(f.transitions.record).toEqual(journal);
    expect(f.opened()).toBe(1);
});

test("operator provisioning is explicit and missing or malformed provenance never becomes operator authority", async () => {
    const f = fixture({ kind: "operator" });
    f.allow(false);
    expect((await f.compose().provision("instance:one")).status).toBe("ready");
    for (const value of [
        undefined,
        null,
        {},
        { kind: "operator", actor: issuer.actor },
        { kind: "control" },
        { ...issuer, actor: { ...issuer.actor, extra: true } },
    ]) {
        expect(() => assertInstanceCreationAuthority(value)).toThrow("authority");
    }
});
