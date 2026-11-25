import { expect, test } from "bun:test";
import { chmod, readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { profileCliFixture } from "../profiles/fixture";
const read = async (path: string) => JSON.parse(await readFile(path, "utf8"));
test("backup commands preserve data, credentials, exact image versions and native lock inodes", async () => {
    const f = await profileCliFixture();
    try {
        expect((await f.run(["apply", "--version", "0.1.0"])).exitCode).toBe(0);
        const backup = join(f.root, "checkpoint"),
            file = join(f.root, "data/business.json");
        await writeFile(file, "original");
        const deployment = await read(join(f.root, "data/services/stack.json"));
        const secret = await readFile(join(f.root, "data/services/provider-operator-token"), "utf8");
        const lock = await stat(join(f.root, "data/.write-lock"));
        expect((await f.run(["backup", "create", backup])).exitCode).toBe(0);
        expect((await f.run(["backup", "verify", backup])).exitCode).toBe(0);
        expect((await f.run(["upgrade", "--version", "0.2.0"])).exitCode).toBe(0);
        await writeFile(file, "after upgrade");
        expect((await f.run(["backup", "restore", backup])).exitCode).not.toBe(0);
        expect(await readFile(file, "utf8")).toBe("after upgrade");
        const restored = await f.run(["backup", "restore", backup, "--yes"]);
        expect(restored.exitCode, restored.stderr).toBe(0);
        expect(await readFile(file, "utf8")).toBe("original");
        // A rollback-opening retry may have already admitted new writes to the restored runtime.
        const recovery = {
            schema: "ulvia.maintenance/v1",
            kind: "upgrade",
            phase: "rollback-opening",
            backup,
            applied: deployment.applied,
            target: deployment.applied,
            previous: deployment,
        };
        await writeFile(join(f.root, "data/.maintenance.json"), JSON.stringify(recovery), { mode: 0o600 });
        await writeFile(file, "after restored runtime opened");
        expect((await f.run(["backup", "restore", backup, "--yes"])).exitCode).toBe(0);
        expect(await readFile(file, "utf8")).toBe("after restored runtime opened");
        expect(await read(join(f.root, "data/services/stack.json"))).toEqual(deployment);
        expect(await readFile(join(f.root, "data/services/provider-operator-token"), "utf8")).toBe(secret);
        expect((await stat(join(f.root, "data/.write-lock"))).ino).toBe(lock.ino);
        expect((await stat(backup)).mode & 0o777).toBe(0o700);
        expect((await stat(join(backup, "backup.json"))).mode & 0o777).toBe(0o600);
        expect((await f.run(["status"])).stdout).toContain("Stack release: 0.1.0");
    } finally {
        await f.close();
    }
});
test("corrupt and incomplete backups refuse before stopping services or modifying live data", async () => {
    const f = await profileCliFixture();
    try {
        expect((await f.run(["apply", "--version", "0.1.0"])).exitCode).toBe(0);
        const backup = join(f.root, "checkpoint"),
            file = join(f.root, "data/business.json");
        await writeFile(file, "original");
        expect((await f.run(["backup", "create", backup])).exitCode).toBe(0);
        await writeFile(join(backup, "payload/business.json"), "tampered");
        await writeFile(file, "live");
        const offset = (await readFile(join(f.root, "calls.ndjson"), "utf8")).length;
        expect((await f.run(["backup", "restore", backup, "--yes"])).exitCode).not.toBe(0);
        expect(await readFile(file, "utf8")).toBe("live");
        expect((await readFile(join(f.root, "calls.ndjson"), "utf8")).slice(offset)).not.toContain('"stop"');
        expect((await f.run(["backup", "create", backup])).stderr).toContain("already exists");
        expect((await f.run(["backup", "create", join(f.root, "data/nested")])).exitCode).not.toBe(0);
        expect((await f.run(["backup", "restore", "relative", "--yes"])).stderr).toContain("absolute-directory");
    } finally {
        await f.close();
    }
});
test("upgrade planning leaves applied state and services unchanged; migration refusal restores the checkpoint", async () => {
    const f = await profileCliFixture();
    try {
        expect((await f.run(["apply", "--version", "0.1.0"])).exitCode).toBe(0);
        const statePath = join(f.root, "data/services/stack.json"),
            before = await read(statePath);
        const offset = (await readFile(join(f.root, "calls.ndjson"), "utf8")).length;
        const plan = await f.run(["upgrade", "--version", "0.2.0", "--plan"]);
        expect(plan.exitCode, plan.stderr).toBe(0);
        expect(plan.stdout).toContain('"targetVersion":"0.2.0"');
        expect(await read(statePath)).toEqual(before);
        const calls = (await readFile(join(f.root, "calls.ndjson"), "utf8")).slice(offset);
        expect(calls).not.toContain('"stop"');
        expect(calls).not.toContain('"up"');
        const refused = await f.run(
            ["upgrade", "--version", "0.2.0", "--backup-directory", `${f.root}/unused/../normalized-checkpoint`],
            { ULVIA_TEST_MIGRATION_FAIL: "1" },
        );
        expect(await Bun.file(join(f.root, "normalized-checkpoint/backup.json")).exists()).toBe(true);
        expect(refused.exitCode).not.toBe(0);
        expect(refused.stderr).toContain("Previous installation restored");
        expect(await read(statePath)).toEqual(before);
        // Resume an interrupted data restore even if its live deployment artifacts disappeared.
        const backup = join(f.root, "manual");
        expect((await f.run(["backup", "create", backup])).exitCode).toBe(0);
        const journal = {
            schema: "ulvia.maintenance/v1",
            kind: "restore",
            phase: "rollback-restoring",
            backup,
            applied: before.applied,
            target: null,
            previous: before,
        };
        await writeFile(join(f.root, "data/.maintenance.json"), JSON.stringify(journal));
        await chmod(join(f.root, "data/.maintenance.json"), 0o600);
        await writeFile(statePath, "incomplete");
        expect((await f.run(["backup", "restore", backup, "--yes"])).exitCode).toBe(0);
        expect(await read(statePath)).toEqual(before);
        await writeFile(statePath, "damaged live metadata");
        expect((await f.run(["backup", "restore", backup, "--yes"])).exitCode).toBe(0);
        expect(await read(statePath)).toEqual(before);
    } finally {
        await f.close();
    }
});
