import { describe, expect, test } from "bun:test";
import { readRepositoryFilesystemCapacity } from "../../src/core/filesystemCapacity";

describe("repository filesystem capacity", () => {
    test("reports exact byte strings and bounded utilization from statfs blocks", async () => {
        const capacity = await readRepositoryFilesystemCapacity("/private/registry", {
            now: () => new Date("2026-07-26T12:00:00.000Z"),
            read: async () => ({ bsize: 4_096n, blocks: 1_000n, bfree: 250n, bavail: 200n }),
        });

        expect(capacity).toEqual({
            status: "available",
            checkedAt: "2026-07-26T12:00:00.000Z",
            totalBytes: "4096000",
            freeBytes: "1024000",
            availableBytes: "819200",
            usedBytes: "3072000",
            usedBasisPoints: 7500,
        });
    });

    test("returns one sanitized unavailable state without retaining the root or statfs error", async () => {
        const capacity = await readRepositoryFilesystemCapacity("/private/registry", {
            now: () => new Date("2026-07-26T12:00:00.000Z"),
            read: async () => {
                throw new Error("ENOENT /private/registry token=secret");
            },
        });

        const serialized = JSON.stringify(capacity);
        expect(capacity).toEqual({ status: "unavailable", checkedAt: "2026-07-26T12:00:00.000Z" });
        expect(serialized).not.toContain("/private/registry");
        expect(serialized).not.toContain("secret");
    });
});
