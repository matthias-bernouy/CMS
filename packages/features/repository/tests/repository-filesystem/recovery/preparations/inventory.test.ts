import { expect, spyOn, test } from "bun:test";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { listPreparations } from "repository/repository/authoring/preparations/inventory/list";
import { reservePreparationWorkspace } from "repository/repository/authoring/preparations/workspace";
import { preparationId, seedPreparation } from "./fixture";

test("preparation pages read only selected bounded records and preserve progress after discarding the cursor item", async () => {
    const root = await fs.mkdtemp("/tmp/preparation-inventory-");
    try {
        for (let i = 1; i <= 5; i++) {
            await seedPreparation(root, i);
        }
        await reservePreparationWorkspace(root);
        const reads = spyOn(fs, "open");
        const first = await listPreparations(root, { limit: 2 });
        const paths = reads.mock.calls.map(([path]) => String(path));
        reads.mockRestore();
        expect(paths).toEqual([
            join(root, preparationId(1), "prepared.json"),
            join(root, preparationId(1), "publication.json"),
            join(root, preparationId(2), "prepared.json"),
            join(root, preparationId(2), "publication.json"),
        ]);
        expect(first.items.map((item) => item.preparationId)).toEqual([preparationId(1), preparationId(2)]);
        expect(first.quota).toEqual({ limit: 64, count: 6, inProgress: 1 });
        expect(JSON.stringify(first)).not.toContain("private sources");
        await fs.rm(join(root, first.nextCursor!), { recursive: true });
        const second = await listPreparations(root, { cursor: first.nextCursor!, limit: 2 });
        expect(second.items.map((item) => item.preparationId)).toEqual([preparationId(3), preparationId(4)]);
        const last = await listPreparations(root, { cursor: second.nextCursor!, limit: 2 });
        expect(last.items.map((item) => item.preparationId)).toEqual([preparationId(5)]);
        expect(last.nextCursor).toBeNull();
        expect((await listPreparations(`${root}-foreign`)).items).toEqual([]);
    } finally {
        await fs.rm(root, { recursive: true, force: true });
        await fs.rm(`${root}-foreign`, { recursive: true, force: true });
    }
});

test("all preparation kinds expose local publication evidence without dropping corrupt or oversized records", async () => {
    const root = await fs.mkdtemp("/tmp/preparation-metadata-");
    try {
        await seedPreparation(root, 1);
        await seedPreparation(root, 2, "contract", "sources-pending");
        await seedPreparation(root, 3, "provider-manifest", "published");
        await seedPreparation(root, 4, "workflow");
        const corrupt = await seedPreparation(root, 5);
        await fs.writeFile(join(corrupt.path, "prepared.json"), "{");
        const oversized = await seedPreparation(root, 6);
        await fs.truncate(join(oversized.path, "prepared.json"), 40 * 1024 * 1024 + 1);
        const page = await listPreparations(root);
        expect(page.items.map((item) => [item.kind, item.publicationState])).toEqual([
            ["collection", "not-recorded"],
            ["contract", "sources-pending"],
            ["provider-manifest", "published"],
            ["workflow", "not-recorded"],
            [null, "unreadable"],
            [null, "unreadable"],
        ]);
        expect(page.items.slice(0, 4).every((item) => item.resourceId === "publisher/kit")).toBe(true);
        expect(page.items.every((item) => Number.isFinite(Date.parse(item.expiresAt)))).toBe(true);
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
});

test("invalid queries and substituted symlinks cannot expose other preparation roots or secret files", async () => {
    const root = await fs.mkdtemp("/tmp/preparation-links-");
    try {
        const secret = join(root, "private.json");
        await fs.writeFile(secret, '{"secret":"private token"}');
        const linked = await seedPreparation(root, 1);
        await fs.rm(join(linked.path, "prepared.json"));
        await fs.symlink(secret, join(linked.path, "prepared.json"));
        await fs.symlink(root, join(root, preparationId(2)));
        const before = await fs.readdir(root);
        for (const input of [{ cursor: "../escape" }, { limit: 0 }, { limit: 9 }]) {
            await expect(listPreparations(root, input)).rejects.toThrow("Invalid preparation inventory query");
        }
        expect(await fs.readdir(root)).toEqual(before);
        const page = await listPreparations(root);
        expect(page.items).toHaveLength(1);
        expect(page.items[0]!.publicationState).toBe("unreadable");
        expect(JSON.stringify(page)).not.toContain("private token");
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
});
