import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
    UploadMaintenance,
    UPLOAD_MAINTENANCE_BATCH,
} from "../../../src/repository/filesystem/mutations/uploadMaintenance";
import { readUploadQueue, sameUploadPosition } from "../../../src/repository/filesystem/mutations/uploadQueueState";
import { manifest, uploadFixture } from "./uploadFixtures";

test("one cleanup job visits a bounded batch, persists progress and resumes after reopening", async () => {
    const f = await uploadFixture();
    const visited: string[] = [];
    let release!: () => void;
    let started!: () => void;
    const began = new Promise<void>((resolve) => {
        started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const maintenance = new UploadMaintenance(f.root, async (id) => {
        if (visited.length === 0) {
            started();
            await gate;
        }
        visited.push(id);
        return false;
    });
    const ids = Array.from({ length: UPLOAD_MAINTENANCE_BATCH * 3 }, () => randomUUID());
    try {
        for (const id of ids) {
            await maintenance.enroll(id, async () => {});
        }
        const initial = maintenance.run();
        await began;
        expect(maintenance.run()).toBe(initial);
        expect(visited).toHaveLength(0);
        release();
        await initial;
        expect(visited).toEqual(ids.slice(0, UPLOAD_MAINTENANCE_BATCH));
        await maintenance.close();
        await maintenance.close();
        await expect(maintenance.run()).rejects.toThrow("closed");
        const reopened = new UploadMaintenance(f.root, async (id) => {
            visited.push(id);
            return false;
        });
        try {
            await reopened.run();
            expect(visited).toEqual(ids.slice(0, UPLOAD_MAINTENANCE_BATCH * 2));
            await reopened.run();
            expect(visited).toEqual(ids);
            expect(
                (await readdir(join(f.root, ".publication-upload-queue"))).filter((path) => path.endsWith(".ids")),
            ).toEqual([]);
        } finally {
            await reopened.close();
        }
    } finally {
        release();
        await maintenance.close();
        await f.close();
    }
});

test("failed cleanup keeps the durable cursor and corrected retries visit each remaining session", async () => {
    const f = await uploadFixture();
    let broken = true;
    let visits = 0;
    const maintenance = new UploadMaintenance(f.root, async () => {
        visits++;
        if (broken) {
            throw new Error("corrupt staging");
        }
        return false;
    });
    try {
        await maintenance.enroll(randomUUID(), async () => {});
        const before = await readUploadQueue(join(f.root, ".publication-upload-queue"));
        await expect(maintenance.run()).rejects.toThrow("corrupt staging");
        expect(await readUploadQueue(join(f.root, ".publication-upload-queue"))).toEqual(before);
        broken = false;
        await maintenance.run();
        expect(visits).toBe(2);
        const after = await readUploadQueue(join(f.root, ".publication-upload-queue"));
        expect(sameUploadPosition(after.head, after.tail)).toBe(true);
    } finally {
        await maintenance.close();
        await f.close();
    }
});

test("queued committed history is discarded without parsing result or manifest JSON, while exact resume still works", async () => {
    const f = await uploadFixture();
    const enrollments = new UploadMaintenance(f.root, async () => false);
    try {
        for (let index = 0; index < UPLOAD_MAINTENANCE_BATCH * 4; index++) {
            const id = randomUUID();
            await enrollments.enroll(id, async () => {
                const directory = join(f.root, ".publication-uploads", id);
                await mkdir(directory, { recursive: true });
                await writeFile(join(directory, "upload.json"), "not loaded");
                await writeFile(join(directory, "result.json"), "not loaded");
            });
        }
        const store = f.open();
        const receipt = await store.create(manifest(), f.expiry());
        expect(await store.describe(receipt.uploadId)).toEqual(manifest());
        expect(await readdir(join(f.root, ".publication-uploads"))).toHaveLength(UPLOAD_MAINTENANCE_BATCH * 4 + 1);
        await store.close();
        const reopened = f.open();
        expect((await reopened.create(manifest(), f.expiry())).uploadId).toBe(receipt.uploadId);
    } finally {
        await enrollments.close();
        await f.close();
    }
});

test("recovery cleans enrollment interrupted before metadata and abort interrupted after its atomic rename", async () => {
    const f = await uploadFixture();
    const enrollment = new UploadMaintenance(f.root, async () => false);
    try {
        const id = randomUUID();
        const directory = join(f.root, ".publication-uploads", id);
        await expect(
            enrollment.enroll(id, async () => {
                await mkdir(directory, { recursive: true });
                throw new Error("crash");
            }),
        ).rejects.toThrow("crash");
        const store = f.open();
        await store.recover();
        expect(await Bun.file(join(directory, "upload.json")).exists()).toBe(false);
        expect(await readdir(join(f.root, ".publication-uploads"))).toEqual([]);
        const receipt = await store.create(manifest(), f.expiry());
        const tombstone = join(f.root, ".publication-upload-tombstones", receipt.uploadId);
        await rename(join(f.root, ".publication-uploads", receipt.uploadId), tombstone);
        await store.recover();
        expect(await readdir(join(f.root, ".publication-upload-tombstones"))).toEqual([]);
        await expect(store.status(receipt.uploadId)).rejects.toThrow();
    } finally {
        await enrollment.close();
        await f.close();
    }
});
