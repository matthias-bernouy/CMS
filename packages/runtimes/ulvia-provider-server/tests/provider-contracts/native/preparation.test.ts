import { expect, test } from "bun:test";
import { nativeFixture } from "./fixture";

test("mutable authority is read after asynchronous immutable contract preparation", async () => {
    const f = await nativeFixture({ control: true });
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    f.model.beforeArtifact = async () => {
        entered.resolve();
        await release.promise;
    };
    const pending = f.authorize({ ...f.claims, connectionId: undefined }, true);
    await entered.promise;
    expect(f.model.reads).toHaveLength(0);
    const state = structuredClone(f.model.state);
    state.selections!.grants.denied.push({ contractId: "ulvia.cms.installations", capabilityId: "item.list" });
    f.model.state = state;
    release.resolve();
    expect(await pending).toBe(false);
    expect(f.model.reads).toHaveLength(1);
});

test("control requests use one current read per warm receipt even after an unrelated upgrade", async () => {
    const f = await nativeFixture({ control: true });
    const claims = { ...f.claims, connectionId: undefined };
    expect(await f.authorize(claims, true)).toBe(true);
    const before = f.model.reads.length;
    f.model.beforeRead = () => {
        f.model.state = { ...f.model.state, selections: { ...f.model.state.selections!, revision: 2 } };
    };
    expect(await f.authorize(claims, true)).toBe(true);
    expect(f.model.reads.length - before).toBe(1);
});

test("control hints choose queried IDs, remain instance-local and cannot authorize stale selections", async () => {
    const f = await nativeFixture({ control: true });
    const claims = { ...f.claims, connectionId: undefined };
    expect(await f.authorize(claims, true)).toBe(true);
    expect(f.model.reads).toEqual([[], [f.selection.installationId]]);
    expect(await f.authorize(claims, true)).toBe(true);
    expect(f.model.reads).toHaveLength(3);
    const state = structuredClone(f.model.state);
    state.selections!.plan.selections[0]!.installationId = "another-native";
    state.installations = [
        { ...state.installations[0]!, installation: { ...state.installations[0]!.installation, id: "another-native" } },
    ];
    f.model.state = state;
    expect(await f.authorize(claims, true)).toBe(true);
    expect(f.model.reads.slice(-2)).toEqual([[f.selection.installationId], ["another-native"]]);
    const other = await nativeFixture({ control: true });
    expect(await other.authorize({ ...other.claims }, true)).toBe(true);
    expect(other.model.reads[0]).toEqual([]);
});

test("failed immutable preparation and failed authority reads never fall back to a previous decision", async () => {
    const f = await nativeFixture({ control: true });
    const claims = { ...f.claims, connectionId: undefined };
    f.model.artifactUnavailable = true;
    await expect(f.authorize(claims, true)).rejects.toThrow("execution pin");
    expect(f.model.reads).toHaveLength(0);
    f.model.artifactUnavailable = false;
    expect(await f.authorize(claims, true)).toBe(true);
    f.model.beforeRead = () => {
        throw new Error("Authority unavailable");
    };
    await expect(f.authorize(claims, true)).rejects.toThrow("Authority unavailable");
});

test("native code context snapshots its report and coalesces concurrent immutable preparation", async () => {
    const f = await nativeFixture();
    f.report.instanceId = "mutated-caller-report";
    const result = await Promise.all([f.authorize(f.claims), f.authorize(f.claims)]);
    expect(result).toEqual([true, true]);
    expect(f.model.artifactReads).toBe(1);
    expect(f.model.reads).toHaveLength(0);
});

test("a verified lease that expires during immutable preparation cannot start execution", async () => {
    const f = await nativeFixture();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    f.model.beforeArtifact = async () => {
        entered.resolve();
        await release.promise;
    };
    const pending = f.authorize(f.claims);
    await entered.promise;
    f.model.now = f.claims.expiresAt + 6;
    release.resolve();
    expect(await pending).toBe(false);
    expect(f.model.reads).toHaveLength(0);
});
