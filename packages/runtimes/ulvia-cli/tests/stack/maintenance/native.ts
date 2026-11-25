import { configureNativeErrorPage, observeNativeMaintenance } from "./presentation/observer";
import type { HostedSite } from "../edgeSmoke/setup";
import { withRepositoryWriteLock } from "@bernouy/repository/repository/filesystem/lock";
import { resolveUlviaPaths } from "../../../src/runtime/paths";
import { readDeploymentState } from "../../../src/runtime/stack/orchestration/state";
import { prepareDeployment } from "../../../src/runtime/stack/orchestration/deployment/artifacts";
import { protectedUpgrade } from "../../../src/runtime/maintenance/upgrade";
import { expect } from "bun:test";
import { join } from "node:path";
import { readFile, writeFile, rm, stat } from "node:fs/promises";
import { runCli } from "../../../src/cli";
/** Real cold Mongo/files/keys snapshot and restore, inside the disposable native hosting journey. */
export async function verifyNativeBackup(
    environment: Record<string, string | undefined>,
    log: (message: string) => void,
    site: HostedSite,
) {
    const data = environment.ULVIA_DATA_DIR!,
        backup = `${data}-checkpoint`,
        upgradeBackup = `${data}-upgrade-checkpoint`,
        sentinel = join(data, "services/cms-files/backup-sentinel");
    const options = { environment, log };
    const applied = await readFile(join(data, "services/stack.json"), "utf8");
    const key = await readFile(join(data, "services/provider-operator-token"), "utf8");
    const inode = (await stat(join(data, ".write-lock"))).ino;
    try {
        await configureNativeErrorPage(site);
        await writeFile(sentinel, "checkpoint");
        await runCli(["backup", "create", backup], options);
        await runCli(["backup", "verify", backup], options);
        // Reconcile a fresh target snapshot of the same exact candidate images, exercising
        // real maintenance planning, paused Provider/Edge readiness and durable activation.
        const paths = resolveUlviaPaths(environment);
        const source = (await readDeploymentState(paths))!.applied!;
        const target = await prepareDeployment(paths, source.installation, source.release, source.images);
        const stopObserving = observeNativeMaintenance(site);
        try {
            await withRepositoryWriteLock(paths.data, () =>
                withRepositoryWriteLock(paths.repository, () =>
                    protectedUpgrade(paths, source, target, log, upgradeBackup),
                ),
            );
        } finally {
            await stopObserving();
        }
        expect((await readDeploymentState(paths))?.applied?.id).toBe(target.id);
        expect(await Bun.file(join(data, ".maintenance.json")).exists()).toBe(false);
        expect(await Bun.file(join(data, "services/credentials/maintenance.json")).exists()).toBe(false);
        await writeFile(sentinel, "after-checkpoint");
        await runCli(["backup", "restore", backup, "--yes"], options);
        expect(await readFile(sentinel, "utf8")).toBe("checkpoint");
        expect(await readFile(join(data, "services/stack.json"), "utf8")).toBe(applied);
        expect(await readFile(join(data, "services/provider-operator-token"), "utf8")).toBe(key);
        expect((await stat(join(data, ".write-lock"))).ino).toBe(inode);
    } finally {
        await rm(backup, { recursive: true, force: true });
        await rm(upgradeBackup, { recursive: true, force: true });
    }
}
