import { verifyPresentation } from "./presentation";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "bun:test";
import { runCommand } from "../../../../../src/runtime/process";
import { database, until, journal } from "../database";
import type { UpgradeFixture } from "../fixture";
import type { HistoricalData } from "../seed";
export async function crashMigration(f: UpgradeFixture, data: HistoricalData) {
    const observer = await database(f);
    const barrier = join(f.root, "cold-backup-barrier");
    const cli = await f.start(
        "new",
        ["upgrade", "--version", f.targetVersion, "--backup-directory", `${f.root}/migration-checkpoint`],
        { ULVIA_UPGRADE_BACKUP_BARRIER: barrier },
    );
    let locked = false;
    try {
        await until(async () => {
            if (typeof cli.child.exitCode === "number") {
                throw new Error(`Upgrade ended before cold-copy barrier; see ${f.root}`);
            }
            return Bun.file(`${barrier}.ready`).exists();
        });
        expect((await journal(f)).phase).toBe("backup");
        for (const row of await f.containers()) {
            expect(row.State.Running).toBe(false);
        }
        await verifyPresentation(f);
        await writeFile(`${barrier}.release`, "continue");
        await until(async () => {
            if (typeof cli.child.exitCode === "number") {
                throw new Error(`Upgrade ended before partial migration; see ${f.root}`);
            }
            if ((await journal(f))?.phase !== "migrating") {
                return false;
            }
            return (
                (await observer.db
                    .collection("forms")
                    .countDocuments({ "record.draft.notification": { $exists: false } })) > 0
            );
        });
        await observer.client.db("admin").command({ fsync: 1, lock: true });
        locked = true;
        const converted = await observer.db
            .collection("forms")
            .countDocuments({ "record.draft.notification": { $exists: false } });
        const remaining = await observer.db
            .collection("forms")
            .countDocuments({ "record.draft.notification": { $exists: true } });
        expect(converted).toBeGreaterThan(0);
        expect(remaining).toBeGreaterThan(0);
        const worker = await until(async () =>
            (await f.containers()).find(
                (row: any) =>
                    row.State.Running &&
                    row.Config.Cmd?.includes("apply") &&
                    row.Config.Cmd?.includes("packages/runtimes/ulvia-provider-server/src/maintenance/upgrade.ts"),
            ),
        );
        await writeFile(
            join(f.root, "partial-migration-proof.json"),
            JSON.stringify({ converted, remaining, workerImage: worker.Image }),
            { mode: 0o600 },
        );
        await verifyPresentation(f);
        cli.kill();
        expect(await cli.result).toBe(137);
        await runCommand([f.environment.ULVIA_UPGRADE_REAL_DOCKER, "kill", "--signal", "KILL", worker.Id]);
        expect((await journal(f)).phase).toBe("migrating");
    } finally {
        if (locked) {
            await observer.client.db("admin").command({ fsyncUnlock: 1 });
        }
        await observer.client.close();
    }
    await verifyPresentation(f);
    expect(await f.run("new", ["upgrade"])).not.toBe(0);
    expect(await journal(f)).toBeNull();
    await data.legacy();
}
