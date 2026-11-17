import { expect, test } from "bun:test";
import { initializationFixture } from "../fixture";

async function observed() {
    const f = await initializationFixture();
    let previews = 0;
    const validate = f.options.validateCandidate;
    Object.assign(f.options, {
        validateCandidate: async (...args: Parameters<typeof validate>) => {
            previews++;
            return validate(...args);
        },
    });
    return { ...f, previews: () => previews };
}

test("warm preparation reuses validation while actor, settings, locale and execution remain fresh", async () => {
    const f = await observed();
    const first = await f.service.plan("admin", f.root);
    const second = await f.service.plan("another-admin", f.root);
    expect(f.previews()).toBe(1);
    expect(second.actorId).toBe("another-admin");
    expect(second.digest).not.toBe(first.digest);
    const revision = await f.raw.getSystemRevision();
    await f.raw.updateSystem({ site: { ...(await f.raw.getSystem()).site, name: "Changed" } }, revision);
    await f.service.plan("admin", f.root);
    expect(f.previews()).toBe(2);
    await f.service.plan("admin", f.root, "fr");
    expect(f.previews()).toBe(3);
    Object.assign(f.options, {
        execution: async () => ({ selected: [], denied: [], fingerprint: "changed-execution" }),
    });
    await f.service.plan("admin", f.root, "fr");
    expect(f.previews()).toBe(4);
    const other = await observed();
    await other.service.plan("admin", other.root);
    expect(other.previews()).toBe(1);
});

test("warm artifacts do not bypass fresh publication availability", async () => {
    const f = await observed();
    await f.service.plan("admin", f.root);
    f.options.source.page = async () => ({ entries: [] });
    await expect(f.service.plan("admin", f.root)).rejects.toThrow("unavailable");
    expect(f.previews()).toBe(1);
    expect((await f.state.read("default"))?.status).toBe("pending");
    expect((await f.options.collections.listInstalled("default")).items).toEqual([]);
});

test("execution changes during a warm lookup refuse the old validation proof", async () => {
    const f = await observed();
    let fingerprint = "a";
    Object.assign(f.options, { execution: async () => ({ selected: [], denied: [], fingerprint }) });
    await f.service.plan("admin", f.root);
    const list = f.options.source.list;
    f.options.source.list = async () => {
        const result = await list();
        fingerprint = "b";
        return result;
    };
    await expect(f.service.plan("admin", f.root)).rejects.toThrow("changed while being reviewed");
    expect(f.previews()).toBe(1);
    await f.service.plan("admin", f.root);
    expect(f.previews()).toBe(2);
    expect((await f.raw.scanPages(undefined, 1)).pages).toEqual([]);
});

test("failed previews are retried and mid-request system changes cannot reuse an earlier review", async () => {
    const f = await observed();
    const preview = f.options.validateCandidate;
    let attempts = 0;
    Object.assign(f.options, {
        validateCandidate: async (...args: Parameters<typeof preview>) => {
            attempts++;
            if (attempts === 1) {
                throw new Error("Refused preview");
            }
            return preview(...args);
        },
    });
    await expect(f.service.plan("admin", f.root)).rejects.toThrow("Refused preview");
    await f.service.plan("admin", f.root);
    expect(attempts).toBe(2);
    const list = f.options.source.list;
    f.options.source.list = async () => {
        const result = await list();
        const revision = await f.raw.getSystemRevision();
        await f.raw.updateSystem({ site: { ...(await f.raw.getSystem()).site, name: "Concurrent change" } }, revision);
        return result;
    };
    await expect(f.service.plan("admin", f.root)).rejects.toThrow("changed while being reviewed");
    expect(attempts).toBe(2);
    expect((await f.raw.scanPages(undefined, 1)).pages).toEqual([]);
});
