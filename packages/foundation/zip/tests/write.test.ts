import { expect, test } from "bun:test";
import { readZip, writeZip } from "../src/exports";

test("writes sorted deterministic files with fixed metadata and interoperable empty ZIPs", async () => {
    const first = [
        { path: "z.txt", bytes: "last" },
        { path: "a.txt", bytes: "first" },
    ];
    const a = new Uint8Array(await (await writeZip(first)).arrayBuffer());
    const b = new Uint8Array(await (await writeZip([...first].reverse())).arrayBuffer());
    expect(a).toEqual(b);
    const decoded = await readZip(a);
    expect(decoded.entries.map((entry) => entry.path)).toEqual(["a.txt", "z.txt"]);
    expect(await decoded.entries[0]?.bytes.text()).toBe("first");
    expect((await readZip(await writeZip([]))).entries).toEqual([]);
});

test("captures source names, bytes and limits before yielding", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const entries = [{ path: "file", bytes }];
    const limits = { maxTotalBytes: 3 };
    const pending = writeZip(entries, { limits });
    bytes.fill(9);
    entries[0]!.path = "../changed";
    entries.length = 0;
    limits.maxTotalBytes = 1;
    const decoded = await readZip(await pending);
    expect(decoded.entries[0]?.path).toBe("file");
    expect(new Uint8Array(await decoded.entries[0]!.bytes.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
});

test("writer bounds inputs and emitted archive overhead", async () => {
    await expect(writeZip([{ path: "a", bytes: "123" }], { limits: { maxEntryBytes: 2 } })).rejects.toMatchObject({
        code: "limit_exceeded",
    });
    await expect(
        writeZip(
            [
                { path: "a", bytes: "1" },
                { path: "b", bytes: "2" },
            ],
            { limits: { maxEntries: 1 } },
        ),
    ).rejects.toMatchObject({ code: "limit_exceeded" });
    await expect(writeZip([{ path: "a", bytes: "123" }], { limits: { maxArchiveBytes: 32 } })).rejects.toMatchObject({
        code: "limit_exceeded",
    });
    await expect(writeZip([{ path: "../escape", bytes: "" }])).rejects.toMatchObject({ code: "invalid_path" });
    await expect(writeZip([], { limits: { maxEntries: Number.NaN } })).rejects.toBeInstanceOf(TypeError);
});

test("does not swallow cancellation during Blob capture", async () => {
    const controller = new AbortController();
    const reason = new Error("caller canceled");
    const pending = writeZip([{ path: "file", bytes: new Blob([new Uint8Array(1024 * 1024)]) }], {
        signal: controller.signal,
    });
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
    await expect(writeZip([], { signal: controller.signal })).rejects.toBe(reason);
});

test("produces identical archive bytes in independent host timezones", async () => {
    const entry = new URL("../src/exports/index.ts", import.meta.url).pathname;
    const script = `import { writeZip } from ${JSON.stringify(entry)};
        const zip = await writeZip([{ path: "file", bytes: "same" }]);
        console.log(new Bun.CryptoHasher("sha256").update(await zip.arrayBuffer()).digest("hex"));`;
    const results = await Promise.all(
        ["Pacific/Honolulu", "Asia/Tokyo"].map(async (timezone) => {
            const child = Bun.spawn([process.execPath, "-e", script], {
                env: { ...process.env, TZ: timezone },
                stdout: "pipe",
                stderr: "pipe",
            });
            const [output, error, status] = await Promise.all([
                new Response(child.stdout).text(),
                new Response(child.stderr).text(),
                child.exited,
            ]);
            expect(error).toBe("");
            expect(status).toBe(0);
            return output.trim();
        }),
    );
    expect(results[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(results[0]).toBe(results[1]);
});
