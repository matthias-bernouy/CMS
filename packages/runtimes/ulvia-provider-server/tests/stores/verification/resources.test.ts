import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryContentRepository } from "@bernouy/content";
import { ResourceArchiveError } from "@bernouy/resources";
import { ResourceInitializationService } from "@bernouy/resources/initialization";
import { HostPreparationPool } from "../../../src/runtime/instances/verification/HostPreparationPool";
import { transferableResourceTask } from "../../../src/runtime/instances/verification/resources/transport";
import { archiveFixture, initializationFixture } from "./resourcesFixture";

test("resource preparation owns verified ZIP/assets and previews ordinary writes without executing authored JavaScript", async () => {
    const source = await archiveFixture();
    const directory = await mkdtemp(join(tmpdir(), "ulvia-resource-worker-"));
    const file = join(directory, "base.zip");
    const pool = new HostPreparationPool();
    try {
        await Bun.write(file, source.bytes);
        const signal = new AbortController().signal;
        const archive = await pool.resources.verify(Bun.file(file), source.digest, signal);
        await rm(file);
        expect(new Uint8Array(await archive.bytes.arrayBuffer())).toEqual(
            new Uint8Array(await source.bytes.arrayBuffer()),
        );
        expect(await archive.assets[0]!.bytes.text()).toBe("resource bytes");
        expect(Object.isFrozen(archive.document)).toBe(true);
        const repository = new InMemoryContentRepository();
        const system = await repository.getSystem();
        const pending = pool.resources.preview(
            archive,
            { fingerprint: "selected", selected: [], denied: [] },
            system,
            signal,
        );
        system.theme.activeThemeId = "invalid-after-submission";
        const preview = await pending;
        expect(preview.pages.map(({ path }) => path)).toEqual(["/"]);
        expect(preview.requirements).toEqual([]);
        expect(preview.themeDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
        expect((await repository.scanPages(undefined, 1)).pages).toHaveLength(0);
        expect(await rejection(pool.resources.verify(source.bytes, `sha256:${"0".repeat(64)}`, signal))).toBeInstanceOf(
            ResourceArchiveError,
        );
        expect(pool.stats()).toEqual({ active: false, queued: 0, bytes: 0 });
    } finally {
        await pool.close();
        await rm(directory, { recursive: true, force: true });
    }
});

test("reviewed initialization uses the host worker ports and completed replay no longer needs preparation or source ZIP", async () => {
    const pool = new HostPreparationPool();
    try {
        const f = await initializationFixture(pool);
        const service = new ResourceInitializationService(f.options);
        const review = await service.plan("admin", "base", "en");
        expect(review.counts).toEqual({ blocs: 1, assets: 1, texts: 1, pages: 1 });
        expect(review.browserRisk.level).toBe("high");
        expect(await f.metadata.isEmpty()).toBe(true);
        const guard = { signal: new AbortController().signal, assertHeld() {} };
        await expect(service.apply("other", review, review.browserRiskDigest, guard)).rejects.toThrow("Administrator");
        const completed = await service.apply("admin", review, review.browserRiskDigest, guard);
        expect(completed.status).toBe("completed");
        expect((await f.raw.getPage("/"))?.visible).toBe(true);
        expect(f.retained.size).toBe(0);
        await pool.close();
        const reopened = new ResourceInitializationService({
            ...f.options,
            source: async () => {
                throw new Error("Source ZIP removed");
            },
        });
        expect(await reopened.apply("admin", review, review.browserRiskDigest, guard)).toEqual(completed);
    } finally {
        await pool.close();
    }
});

test("resource preparation refuses oversized/invalid inputs, bounds retained bytes and recovers after cancellation", async () => {
    const source = await archiveFixture();
    const pool = new HostPreparationPool();
    try {
        const controller = new AbortController();
        const first = pool.resources.verify(source.bytes, source.digest, controller.signal);
        const second = pool.resources.verify(source.bytes, source.digest, new AbortController().signal);
        controller.abort();
        await expect(first).rejects.toMatchObject({ name: "AbortError" });
        expect((await second).digest).toBe(source.digest);
        const large = new Blob([new Uint8Array(16 * 1024 * 1024)]);
        const pending = Array.from({ length: 5 }, () =>
            pool.resources.verify(large, source.digest, new AbortController().signal),
        );
        const results = Promise.allSettled(pending);
        expect(pool.stats().bytes).toBeLessThanOrEqual(64 * 1024 * 1024);
        expect((await results).some((item) => item.status === "rejected" && item.reason.status === 503)).toBe(true);
        expect(pool.stats()).toEqual({ active: false, queued: 0, bytes: 0 });
        const system = await new InMemoryContentRepository().getSystem();
        await expect(
            pool.resources.preview(
                null,
                { fingerprint: "x".repeat(5 * 1024 * 1024), selected: [], denied: [] },
                system,
                new AbortController().signal,
            ),
        ).rejects.toThrow("metadata");
        expect(pool.stats()).toEqual({ active: false, queued: 0, bytes: 0 });
        expect((await pool.resources.verify(source.bytes, source.digest, new AbortController().signal)).digest).toBe(
            source.digest,
        );
    } finally {
        await pool.close();
    }
});

async function rejection(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
        throw new Error("Expected preparation refusal");
    } catch (error) {
        return error;
    }
}

test("resource transport reserves observed file growth before retaining chunks and cancels a refused stream", async () => {
    let cancelled = false;
    class GrowingInput extends Blob {
        override stream() {
            return new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new Uint8Array(32));
                },
                cancel() {
                    cancelled = true;
                },
            });
        }
    }
    const observed: number[] = [];
    const result = transferableResourceTask(
        { kind: "resource-archive", bytes: new GrowingInput(["x"]), digest: `sha256:${"0".repeat(64)}` },
        undefined,
        (bytes) => {
            observed.push(bytes);
            if (bytes > 1) {
                throw new Error("Remaining host preparation capacity exceeded");
            }
        },
    );
    expect(await rejection(result)).toMatchObject({ message: "Remaining host preparation capacity exceeded" });
    expect(observed).toEqual([32]);
    expect(cancelled).toBe(true);
});
