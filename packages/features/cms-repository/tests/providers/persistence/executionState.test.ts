import { expect, test } from "bun:test";
import { executionFixture } from "./executionFixture";

test("a warm execution metadata read issues one fresh grouped query and no payload reads", async () => {
    const f = await executionFixture();
    const first = await f.reader.read(f.siteId, [f.installationId]);
    const beforeWarm = f.model.commands;
    const warm = await f.reader.read(f.siteId, [f.installationId, f.installationId]);
    expect(warm).toEqual(first);
    expect(f.model.commands - beforeWarm).toBe(1);
    expect(f.model.payloads).toBe(2);
    expect(f.model.pipeline[0]).toEqual({ $match: { siteId: f.siteId, _id: { $in: [f.installationId] } } });
    const final = f.model.pipeline.at(-1)!.$lookup as { from: string; pipeline: unknown[] };
    expect(final.from).toBe("cms_contract_selections");
    expect(final.pipeline[0]).toEqual({ $match: { _id: f.siteId, siteId: f.siteId } });
    f.model.installation = {
        ...f.model.installation!,
        revision: 2,
        installation: { ...f.model.installation!.installation, status: "disabled" },
    };
    expect((await f.reader.read(f.siteId, [f.installationId])).installations[0]!.installation.status).toBe("disabled");
    f.model.selection = {
        ...f.model.selection!,
        revision: 2,
        grants: { default: "allow-selected", denied: [{ contractId: "payment", capabilityId: "pay" }] },
    };
    expect((await f.reader.read(f.siteId, [f.installationId])).selections!.grants.denied).toHaveLength(1);
    expect(f.model.payloads).toBe(4);
});

test("missing metadata and database failures never reuse old authority", async () => {
    const f = await executionFixture();
    await f.reader.read(f.siteId, [f.installationId]);
    f.model.unavailable = true;
    await expect(f.reader.read(f.siteId, [f.installationId])).rejects.toThrow("Database unavailable");
    f.model.unavailable = false;
    f.model.installation = null;
    expect((await f.reader.read(f.siteId, [f.installationId])).installations).toEqual([]);
    f.model.selection = null;
    expect(await f.reader.read(f.siteId, [f.installationId])).toEqual({ selections: null, installations: [] });
});

test("selection changes while decoding retry the whole phase once, then fail closed", async () => {
    const f = await executionFixture();
    f.model.mutateOnPayload = () => {
        f.model.selection = { ...f.model.selection!, revision: 2 };
        f.model.mutateOnPayload = () => {};
    };
    expect((await f.reader.read(f.siteId, [f.installationId])).selections!.revision).toBe(2);
    expect(f.model.commands).toBe(3);
    const unstable = await executionFixture();
    unstable.model.mutateOnPayload = () => {
        unstable.model.selection = { ...unstable.model.selection!, revision: unstable.model.selection!.revision + 1 };
    };
    await expect(unstable.reader.read(unstable.siteId, [unstable.installationId])).rejects.toThrow("Selection changed");
    expect(unstable.model.commands).toBe(2);
});

test("identical IDs in different readers or sites cannot share records", async () => {
    const a = await executionFixture();
    const b = await executionFixture();
    b.model.installation = {
        ...b.model.installation!,
        installation: { ...b.model.installation!.installation, status: "revoked" },
    };
    expect((await a.reader.read(a.siteId, [a.installationId])).installations[0]!.installation.status).toBe("enabled");
    expect((await b.reader.read(b.siteId, [b.installationId])).installations[0]!.installation.status).toBe("revoked");
    expect(await a.reader.read("another-site", [a.installationId])).toEqual({ selections: null, installations: [] });
    b.model.selection = { ...b.model.selection!, siteId: "another-site" };
    expect(await b.reader.read(b.siteId, [b.installationId])).toEqual({ selections: null, installations: [] });
    a.model.installation = {
        ...a.model.installation!,
        revision: 2,
        installation: { ...a.model.installation!.installation, siteId: "another-site" },
    };
    await expect(a.reader.read(a.siteId, [a.installationId])).rejects.toThrow("another scope");
});

test("malformed revisions, unexpected IDs and invalid scopes fail before cached authority is used", async () => {
    for (const invalid of [0, -1, NaN, Number.MAX_SAFE_INTEGER + 1]) {
        const f = await executionFixture();
        await f.reader.read(f.siteId, [f.installationId]);
        f.model.mutateHeaders = (value) => ({
            ...value,
            installations: [{ _id: f.installationId, revision: invalid }],
        });
        await expect(f.reader.read(f.siteId, [f.installationId])).rejects.toThrow("invalid revision");
    }
    const f = await executionFixture();
    f.model.mutateHeaders = (value) => ({ ...value, installations: [{ _id: "unrequested", revision: 1 }] });
    await expect(f.reader.read(f.siteId, [f.installationId])).rejects.toThrow("unexpected installation");
    await expect(f.reader.read(f.siteId, Array(33).fill(f.installationId))).rejects.toThrow("at most 32");
    await expect(f.reader.read(f.siteId, ["invalid\0id"])).rejects.toThrow();
});

test("the final selection read observes grant revocation after installation headers were collected", async () => {
    const f = await executionFixture();
    await f.reader.read(f.siteId, [f.installationId]);
    f.model.beforeSelectionRead = () => {
        f.model.selection = {
            ...f.model.selection!,
            revision: 2,
            grants: { default: "allow-selected", denied: [{ contractId: "payment", capabilityId: "pay" }] },
        };
        f.model.beforeSelectionRead = () => {};
    };
    const current = await f.reader.read(f.siteId, [f.installationId]);
    expect(current.selections!.revision).toBe(2);
    expect(current.selections!.grants.denied).toHaveLength(1);
    expect(f.model.commands).toBe(4);
});

test("an absent or stale installation hint cannot hide the current selection", async () => {
    const f = await executionFixture();
    for (const ids of [[], ["missing"]]) {
        const current = await f.reader.read(f.siteId, ids);
        expect(current.selections!.revision).toBe(1);
        expect(current.installations).toEqual([]);
    }
    await f.reader.read(f.siteId, [f.installationId]);
    f.model.mutateHeaders = (value) => ({ ...value, current: [{ revision: 1 }, { revision: 2 }] });
    await expect(f.reader.read(f.siteId, [f.installationId])).rejects.toThrow("unexpected selection");
});
