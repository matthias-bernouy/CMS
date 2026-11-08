import { expect, test } from "bun:test";
import { installationsFeature } from "@bernouy/repository/features/installations";
import { executeCapability } from "@bernouy/ulvia-sdk/provider";
import { context, reference, services } from "./fixture";
test("invalid installation inputs and stale revisions refuse before source transfer or installation mutation", async () => {
    const calls: string[] = [];
    const ports = services({
        collections: {
            listInstalled: async (site: string) => {
                calls.push("read:" + site);
                return { revision: 4, items: [] };
            },
        },
        sources: {
            stage: async () => {
                calls.push("stage");
                throw new Error("Unexpected transfer");
            },
        },
    });
    const run = (input: unknown) =>
        executeCapability(installationsFeature, "install-collection", { input, services: ports, context });
    for (const input of [
        { expectedRevision: -1, targets: [reference] },
        { expectedRevision: 3, targets: [] },
        { expectedRevision: 3, targets: [{ ...reference, digest: 1 }] },
    ]) {
        await expect(run(input)).rejects.toThrow();
    }
    expect(calls).toEqual([]);
    await expect(run({ expectedRevision: 3, targets: [reference] })).rejects.toMatchObject({
        code: "REVISION_CONFLICT",
    });
    expect(calls).toEqual(["read:site-a"]);
});
test("typed provider status mutations preserve domain failures privately with the capability's declared classification", async () => {
    const cause = Object.assign(new Error("private database path and credential"), {
        status: 409,
        code: "revision_conflict",
    });
    let writes = 0;
    const ports = services({
        management: {
            setStatus: async () => {
                writes++;
                throw cause;
            },
        },
    });
    await expect(
        executeCapability(installationsFeature, "set-provider-status", {
            input: { installationId: "installation", expectedRevision: 1, action: "disable" },
            services: ports,
            context,
        }),
    ).rejects.toMatchObject({
        code: "REVISION_CONFLICT",
        cause,
        output: { message: "The installation request was refused." },
    });
    expect(writes).toBe(1);
});
test("site usage pagination performs one inventory read, returns a bounded page and refuses stale continuation", async () => {
    let reads = 0;
    const ports = services({
        collectionUpgrades: {
            inventory: async (site: string) => {
                expect(site).toBe("site-a");
                reads++;
                return { complete: true, digest: "sha256:" + "a".repeat(64), unknown: [], references: [] };
            },
        },
    });
    expect(
        await executeCapability(installationsFeature, "list-site-usage", {
            input: { limit: 1 },
            services: ports,
            context,
        }),
    ).toEqual({
        complete: true,
        digest: "sha256:" + "a".repeat(64),
        unknown: [],
        unknownCount: 0,
        total: 0,
        references: [],
    });
    await expect(
        executeCapability(installationsFeature, "list-site-usage", {
            input: { cursor: "sha256:" + "b".repeat(64) + ":1", limit: 1 },
            services: ports,
            context,
        }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect(reads).toBe(2);
});
test("gateway audit validates encoded JSON before writes and preserves duplicate receipt behavior", async () => {
    let writes = 0;
    const ports = services({
        gateway: {
            commandAudit: {
                append: async () => {
                    writes++;
                    throw Object.assign(new Error("duplicate"), { code: 11000 });
                },
            },
        },
    });
    const run = (event: string) =>
        executeCapability(installationsFeature, "gateway.audit.append", {
            input: { event },
            services: ports,
            context: { ...context, controlAuthority: true },
        });
    await expect(run("{")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(run("{}")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(writes).toBe(0);
    const event = {
        id: "event",
        requestId: "request",
        occurredAt: "2026-11-08T10:00:00Z",
        siteId: "site-a",
        installationId: "installation",
        contractId: "ulvia/cms.files",
        capabilityId: "files.get",
        actorKind: "administrator",
        stage: "completed",
    };
    expect(await run(JSON.stringify(event))).toEqual({ accepted: true });
    expect(writes).toBe(1);
});
test("an actor missing discriminant-dependent fields cannot reach trusted gateway preparation", async () => {
    let calls = 0;
    const ports = services({
        gateway: {
            invocations: {
                prepare: async () => {
                    calls++;
                    throw new Error("Unexpected preparation");
                },
            },
        },
    });
    const input = {
        invocation: {
            requestId: "00000000-0000-4000-8000-000000000001",
            installationId: "installation",
            contractId: "ulvia/cms.files",
            contractVersion: "1.0.0",
            capabilityId: "files.get",
        },
        actor: { kind: "provider" },
        deadline: 1,
    };
    await expect(
        executeCapability(installationsFeature, "gateway.dispatch.prepare", {
            input,
            services: ports,
            context: { ...context, controlAuthority: true },
        }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(calls).toBe(0);
});
