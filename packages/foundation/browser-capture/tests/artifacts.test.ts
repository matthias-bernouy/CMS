import { expect, test } from "bun:test";
import { MemoryCaptureArtifacts, CaptureBudget, CaptureError, validateCapture } from "../src/index";
const document = { path: "index.html", files: new Map([["index.html", new Blob(["hello"], { type: "text/html" })]]) };
const options = { width: 640, height: 480, mode: "viewport" as const, themeMode: "light" as const };
test("artifacts are copied, owner-bound, expired and evicted within a fixed budget", () => {
    let now = 1000;
    const store = new MemoryCaptureArtifacts(() => now);
    const bytes = new Uint8Array([1, 2, 3]);
    const first = store.put("instance-a/admin-a/connection-a", bytes);
    bytes[0] = 9;
    expect(store.get("instance-a/admin-a/connection-a", first.captureId)).toEqual(new Uint8Array([1, 2, 3]));
    expect(store.get("instance-b/admin-a/connection-a", first.captureId)).toBeNull();
    expect(store.get("instance-a/admin-b/connection-a", first.captureId)).toBeNull();
    expect(store.get("instance-a/admin-a/connection-b", first.captureId)).toBeNull();
    const read = store.get("instance-a/admin-a/connection-a", first.captureId)!;
    read[0] = 8;
    expect(store.get("instance-a/admin-a/connection-a", first.captureId)![0]).toBe(1);
    for (let index = 0; index < 16; index++) {
        store.put("other", new Uint8Array([index]));
    }
    expect(store.get("instance-a/admin-a/connection-a", first.captureId)).toBeNull();
    const last = store.put("owner", new Uint8Array([7]));
    now += 300_000;
    expect(store.get("owner", last.captureId)).toBeNull();
    expect(() => store.put("owner", new Uint8Array(4194305))).toThrow(CaptureError);
});
test("document and viewport limits refuse traversal, excessive pixels and ambiguous options", () => {
    validateCapture(document, options);
    validateCapture({ path: "", files: new Map([["", new Blob(["root"])]]) }, options);
    validateCapture({ path: "?next=/page", files: new Map([["?next=/page", new Blob(["root"])]]) }, options);
    for (const invalid of [
        { width: 4097 },
        { width: 4096, height: 4096 },
        { selector: "button" },
        { mode: "element" },
        { width: 1.5 },
    ]) {
        expect(() => validateCapture(document, { ...options, ...invalid } as never)).toThrow(CaptureError);
    }
    expect(() => validateCapture({ path: "../secret", files: new Map([["../secret", new Blob()]]) }, options)).toThrow(
        CaptureError,
    );
    for (const origin of ["file:///etc", "https://user:password@site.test", "https://site.test/path"]) {
        expect(() => validateCapture({ ...document, origin }, options)).toThrow("INVALID_INPUT");
    }
});

test("aggregate artifact bytes evict before the entry-count limit and failed writes retain no entry", () => {
    const store = new MemoryCaptureArtifacts();
    const ids = Array.from({ length: 9 }, () => store.put("owner", new Uint8Array(4 * 1024 * 1024)).captureId);
    expect(store.get("owner", ids[0]!)).toBeNull();
    expect(store.get("owner", ids[1]!)?.byteLength).toBe(4 * 1024 * 1024);
    expect(store.get("owner", ids[8]!)?.byteLength).toBe(4 * 1024 * 1024);
    expect(() => store.put("owner", new Uint8Array(4 * 1024 * 1024 + 1))).toThrow(CaptureError);
    expect(store.get("owner", ids[1]!)?.byteLength).toBe(4 * 1024 * 1024);
});

test("pipeline budget rejects excess work immediately and releases slots on failure", async () => {
    const budget = new CaptureBudget();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });
    const first = budget.run(() => held);
    const second = budget.run(() => held);
    await expect(budget.run(async () => 3)).rejects.toThrow("BUSY");
    release();
    await Promise.all([first, second]);
    await expect(
        budget.run(async () => {
            throw new Error("failed");
        }),
    ).rejects.toThrow("failed");
    expect(await budget.run(async () => 4)).toBe(4);
});
