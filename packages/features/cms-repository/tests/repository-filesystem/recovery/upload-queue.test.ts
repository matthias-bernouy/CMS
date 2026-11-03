import { expect, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, open, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { UploadMaintenance } from "../../../src/repository/filesystem/mutations/uploadMaintenance";
import {
    readQueueBytes,
    UPLOAD_QUEUE_PAGE_SIZE,
} from "../../../src/repository/filesystem/mutations/uploadQueueRecords";
import { readUploadQueue, writeUploadQueue } from "../../../src/repository/filesystem/mutations/uploadQueueState";
import { uploadFixture } from "./uploadFixtures";

test("queue pages roll over and are durably reclaimed while live sessions circulate", async () => {
    const f = await uploadFixture();
    const visits = new Map<string, number>();
    let retain = true;
    const queue = new UploadMaintenance(f.root, async (id) => {
        visits.set(id, (visits.get(id) ?? 0) + 1);
        return retain;
    });
    const count = UPLOAD_QUEUE_PAGE_SIZE + 5;
    try {
        const ids = Array.from({ length: count }, () => randomUUID());
        for (const id of ids) {
            await queue.enroll(id, async () => {});
        }
        for (let index = 0; index < Math.ceil(count / 8); index++) {
            await queue.run();
        }
        expect(ids.every((id) => visits.has(id))).toBe(true);
        const directory = join(f.root, ".publication-upload-queue");
        expect((await readdir(directory)).filter((path) => path.endsWith(".ids")).length).toBeLessThanOrEqual(3);
        retain = false;
        for (let index = 0; index < Math.ceil(count / 8) + 1; index++) {
            await queue.run();
        }
        expect((await readdir(directory)).filter((path) => path.endsWith(".ids"))).toEqual([]);
    } finally {
        await queue.close();
        await f.close();
    }
}, 15_000);

test("uncommitted tail bytes are overwritten and interrupted obsolete-page cleanup is resumed", async () => {
    const f = await uploadFixture();
    const visited: string[] = [];
    const queue = new UploadMaintenance(f.root, async (id) => {
        visited.push(id);
        return false;
    });
    try {
        const first = randomUUID();
        const second = randomUUID();
        const directory = join(f.root, ".publication-upload-queue");
        await queue.enroll(first, async () => {});
        await appendFile(join(directory, "0.ids"), `${randomUUID()}\n`);
        await queue.enroll(second, async () => {});
        await queue.run();
        expect(visited).toEqual([first, second]);
        await Promise.all([
            writeFile(join(directory, "10.ids"), "abandoned"),
            writeFile(join(directory, "11.ids"), "abandoned"),
        ]);
        await writeUploadQueue(directory, {
            head: { page: 0, offset: 0 },
            tail: { page: 0, offset: 0 },
            discard: [10, 11],
        });
        await queue.enroll(randomUUID(), async () => {});
        expect((await readdir(directory)).filter((path) => path.endsWith(".ids"))).toEqual(["0.ids"]);
        const state = await readUploadQueue(directory);
        await writeUploadQueue(directory, { ...state, discard: [0] });
        await expect(queue.run()).rejects.toThrow("Invalid publication upload queue state");
        expect((await readFile(join(directory, "0.ids"))).length).toBe(37);
    } finally {
        await queue.close();
        await f.close();
    }
});

test("bounded queue reads close their file handles on success and failure", async () => {
    const f = await uploadFixture();
    const path = join(f.root, "read-bound");
    await writeFile(path, "x".repeat(2048));
    const probe = await open(path);
    const prototype = Object.getPrototypeOf(probe);
    await probe.close();
    const close = spyOn(prototype, "close");
    const read = spyOn(prototype, "read");
    try {
        expect((await readQueueBytes(path, 1025))?.length).toBe(1025);
        expect(close).toHaveBeenCalledTimes(1);
        expect(read.mock.calls[0]![0].length).toBe(1025);
        read.mockRejectedValueOnce(new Error("read failed"));
        await expect(readQueueBytes(path, 37)).rejects.toThrow("read failed");
        expect(close).toHaveBeenCalledTimes(2);
        const directory = join(f.root, ".publication-upload-queue");
        await mkdir(directory);
        await writeFile(join(directory, "state.json"), "x".repeat(2048));
        await expect(readUploadQueue(directory)).rejects.toThrow("exceeds its bound");
    } finally {
        read.mockRestore();
        close.mockRestore();
        await f.close();
    }
});
