import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrivateResourceArchives } from "../../../../src/runtime/stores/resources/archives";
import { captureResourceBytes } from "../../../../src/runtime/stores/resources/binary";

const key = (value: string) => "sha256:" + value.repeat(64);

test("private ZIP retention is exact, scoped, bounded and reopens without its original source", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-private-resources-"));
    const archives = new PrivateResourceArchives(join(root, "a"));
    try {
        const first = new Blob(["reviewed ZIP bytes"]);
        await archives.put(key("a"), first);
        await archives.put(key("a"), first);
        await expect(archives.put(key("a"), new Blob(["changed"]))).rejects.toThrow("conflicts");
        expect(await (await new PrivateResourceArchives(join(root, "a")).get(key("a")))!.text()).toBe(
            await first.text(),
        );
        expect(await new PrivateResourceArchives(join(root, "b")).get(key("a"))).toBeNull();
        await archives.put(key("b"), new Blob(["second ZIP"]));
        await expect(archives.put(key("c"), new Blob(["third ZIP"]))).rejects.toThrow("budget");
        expect((await readdir(join(root, "a"))).length).toBe(2);
        await expect(archives.put("../escape", first)).rejects.toThrow("digest");
        await archives.remove(key("a"));
        expect(await archives.get(key("a"))).toBeNull();
        await archives.put(key("c"), new Blob(["replacement after cleanup"]));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("compositions sharing the private root cannot expand retention with concurrent writers", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-private-resources-"));
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });
    class SlowBlob extends Blob {
        override stream() {
            return new ReadableStream<Uint8Array>({
                async start(controller) {
                    await held;
                    controller.enqueue(new TextEncoder().encode("owned bytes"));
                    controller.close();
                },
            });
        }
    }
    const first = new PrivateResourceArchives(root).put(key("a"), new SlowBlob());
    try {
        await expect(new PrivateResourceArchives(root).put(key("b"), new Blob())).rejects.toThrow("busy");
        release();
        await first;
        expect((await readdir(root)).length).toBe(1);
    } finally {
        release();
        await first.catch(() => undefined);
        await rm(root, { recursive: true, force: true });
    }
});

test("bounded resource capture observes growth, cancels and releases its reader", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
            controller.enqueue(new Uint8Array(8));
        },
        cancel() {
            cancelled = true;
        },
    });
    class GrowingBlob extends Blob {
        override stream() {
            return stream;
        }
    }
    await expect(captureResourceBytes(new GrowingBlob(), undefined, undefined, 16)).rejects.toThrow("limit");
    expect(cancelled).toBe(true);
    expect(stream.locked).toBe(false);
});
