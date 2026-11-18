import { expect, test } from "bun:test";
import { namespaceReadState } from "../state/namespace";
import { prepareNamespaceRead } from "../recipe";
import { rasterModel } from "./model";

test("file history contains 33 distinct content generations of one identity and keeps cleanup roots", async () => {
    const model = rasterModel();
    const roots: unknown[] = [];
    const state = namespaceReadState(model.calls, "http://unit.test", false, async (credentials) => {
        roots.push(credentials);
    });
    await state.initialize("history", "files.list");
    expect(state.generations).toHaveLength(33);
    expect(new Set(state.generations.map((row) => row.reference.generation)).size).toBe(33);
    expect(new Set(state.generations.map((row) => row.reference.fileId)).size).toBe(1);
    expect(state.files).toHaveLength(1);
    expect(state.current.dimension).toBe(96);
    await state.close();
    expect(roots).toHaveLength(2);
    expect(roots).toContainEqual(state.credentials);
});

test("large file fixtures create 64 current files rather than repeating one content generation", async () => {
    const model = rasterModel();
    const state = namespaceReadState(model.calls, "http://unit.test", false, async () => {});
    await state.initialize("large", "files.list");
    expect(state.files).toHaveLength(64);
    expect(new Set(state.files.map((row) => row.reference.fileId)).size).toBe(64);
    expect(model.uploads.size).toBe(64);
});

test("file invalidation primes the selected reader before replacement and measures the latest receipt", async () => {
    const model = rasterModel();
    const state = namespaceReadState(model.calls, "http://unit.test", false, async () => {});
    await state.initialize("invalidation", "files.get");
    model.events.length = 0;
    const old = state.current;
    const sample = await prepareNamespaceRead(state, "files.get", "invalidation", 0, model.calls, async () => {});
    expect(model.events.indexOf("read:files.get")).toBeLessThan(model.events.indexOf("upload.create"));
    expect(state.current.reference.fileId).toBe(old.reference.fileId);
    expect(state.current.reference.generation).not.toBe(old.reference.generation);
    expect((await sample.send()).validated).toBe(true);
});

test("namespace invalidation revokes only a primed child key and leaves the cleanup root unchanged", async () => {
    const model = rasterModel();
    const state = namespaceReadState(model.calls, "http://unit.test", false, async () => {});
    await state.initialize("invalidation", "namespace.get");
    const root = state.credentials;
    const old = state.childInput;
    const sample = await prepareNamespaceRead(state, "namespace.get", "invalidation", 0, model.calls, async () => {});
    expect(state.childInput.namespaceKey).not.toBe(old.namespaceKey);
    expect(state.credentials).toBe(root);
    expect((await sample.send()).validated).toBe(true);
});

test("all owned namespaces are attempted during cleanup even when one deletion fails", async () => {
    const model = rasterModel();
    let attempts = 0;
    const state = namespaceReadState(model.calls, "http://unit.test", false, async () => {
        attempts++;
        if (attempts === 1) {
            throw Error("controlled cleanup failure");
        }
    });
    await state.initialize("invalidation", "namespace.get");
    await expect(state.close()).rejects.toThrow("file-reader-namespace-cleanup");
    expect(attempts).toBe(2);
});

test("a cached public body cannot pass preparation after the file becomes private", async () => {
    const model = rasterModel();
    const state = namespaceReadState(model.calls, "http://unit.test", false, async () => {});
    await state.initialize("invalidation", "files.read");
    const first = await prepareNamespaceRead(state, "files.read", "invalidation", 0, model.calls, async () => {});
    expect((await first.send()).validated).toBe(true);
    model.leakPrivateRead();
    await expect(
        prepareNamespaceRead(state, "files.read", "invalidation", 1, model.calls, async () => {}),
    ).rejects.toThrow("file-privacy-cache-not-invalidated");
});

test("timed file pages remain nonempty for both a large namespace and one file with 33 generations", async () => {
    for (const profile of ["large", "history"]) {
        const model = rasterModel();
        const offsets: unknown[] = [];
        const calls = {
            ...model.calls,
            call: async (...args: Parameters<typeof model.calls.call>) => {
                if (args[0] === "files.list") {
                    offsets.push(args[2].offset);
                }
                return model.calls.call(...args);
            },
        };
        const state = namespaceReadState(calls, "http://unit.test", false, async () => {});
        await state.initialize(profile, "files.list");
        const sample = await prepareNamespaceRead(state, "files.list", profile, 9, model.calls, async () => {});
        expect((await sample.send()).validated).toBe(true);
        expect(offsets).toEqual([profile === "large" ? 16 : 0]);
    }
});
