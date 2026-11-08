import { expect, test } from "bun:test";
import { repositoryTransport } from "../../../../src/runtime/instances/composition/repositorySettings";
import { repositorySettingsFixture } from "./settingsFixture";

test("source URL changes need one atomic write, no Registry creation and no remote lookup", async () => {
    const f = repositorySettingsFixture();
    expect(await f.service.get()).toMatchObject({
        url: "https://repo.ulvia.fr",
        configured: false,
        creationStatus: "none",
    });
    expect(f.writes()).toBe(0);
    await f.service.configure({ expectedRevision: 1, url: "http://127.0.0.1:8080/" });
    expect(f.writes()).toBe(1);
    expect(f.calls).toEqual([]);
    expect(await f.service.get()).toMatchObject({ url: "http://127.0.0.1:8080", configured: true, revision: 2 });
    await f.service.configure({ expectedRevision: 1, url: "http://127.0.0.1:8080" });
    expect(f.writes()).toBe(1);
});

test("invalid addresses and stale revisions do not change instance state", async () => {
    const f = repositorySettingsFixture();
    const before = structuredClone(f.current());
    for (const url of [
        "bad",
        "file:///etc/passwd",
        "https://user:secret@example.com",
        "https://example.com/path",
        "https://example.com/?token=x",
        "https://example.com/#x",
    ]) {
        await expect(f.service.configure({ expectedRevision: 1, url })).rejects.toMatchObject({
            code: "INVALID_INPUT",
        });
    }
    await expect(f.service.configure({ expectedRevision: 0, url: "https://remote.example" })).rejects.toMatchObject({
        code: "REVISION_CONFLICT",
    });
    expect(f.current()).toEqual(before);
    expect(f.writes()).toBe(0);
});

test("creation delegates the verified administrator and revision to the sole host transition owner", async () => {
    const f = repositorySettingsFixture();
    await f.service.create({ expectedRevision: 1 }, "local:admin");
    expect(f.calls).toEqual([
        {
            current: expect.objectContaining({ id: "instance:one" }),
            expectedRevision: 1,
            administratorId: "local:admin",
        },
    ]);
    expect(f.current().repository).toEqual({ url: "https://site.example", configured: true });
    expect(repositoryTransport(f.current())).toMatchObject({
        publicUrl: "https://site.example",
        url: "http://edge.private:3000",
    });
});

test("shared immutable caches use distinct stable identities for each configured Repository origin", () => {
    const f = repositorySettingsFixture();
    const one = { ...f.current(), repository: { url: "https://one.example", configured: true } };
    const two = { ...f.current(), repository: { url: "https://two.example", configured: true } };
    expect(repositoryTransport(one).id).not.toBe(repositoryTransport(two).id);
    expect(repositoryTransport(one).id).toBe(repositoryTransport({ ...one, revision: 200 }).id);
});
