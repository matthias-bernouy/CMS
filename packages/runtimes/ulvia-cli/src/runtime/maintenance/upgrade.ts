import { pauseProvider, activateProvider } from "./activation";
import { removeOwnedContainers } from "./containers";
import { newBackupLocation } from "./backup/snapshot";
import { mkdir } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { readMaintenance, saveMaintenance, clearMaintenance } from "./journal";
import { createSnapshot } from "./backup/snapshot";
import { stopDeployments, restoreInstallationBackup } from "./backup/operations";
import { deploymentProject } from "../stack/orchestration/deployment/artifacts";
import { preparePresentation } from "./presentation/prepare";
import { startPresentation, stopPresentation } from "./presentation/frontend";
import { openInstallation } from "./presentation/open";
import { composeStop, composeUp } from "../stack/orchestration/compose";
import { releaseMaintenance, assertMaintenanceImage } from "./migration";
import { executeDeployment } from "../stack/orchestration/deployment/execute";
import type { LocalServicesState, DeploymentOperation } from "../stack/orchestration/state";
import type { UlviaPaths } from "../paths";
export async function protectedUpgrade(
    paths: UlviaPaths,
    applied: LocalServicesState,
    target: LocalServicesState,
    log: (value: string) => void,
    backupDirectory?: string,
) {
    let journal = await readMaintenance(paths);
    if (journal && journal.kind !== "upgrade") {
        throw new Error("Finish the pending installation restore before upgrading");
    }
    if (journal) {
        if (journal.target?.id !== target.id) {
            throw new Error("Resume the exact recorded upgrade target");
        }
        await startPresentation(paths, journal.backup, journal.applied);
        if (journal.phase === "opening") {
            try {
                await executeDeployment(
                    paths,
                    journal.applied,
                    { kind: "upgrade", phase: "prepared", target },
                    log,
                    async () => {
                        await activateProvider(paths, target);
                        await stopPresentation(paths);
                    },
                );
            } catch (error) {
                await startPresentation(paths, journal.backup, journal.applied);
                throw error;
            }
            await clearMaintenance(paths);
            return;
        }
        if (["quiescing", "backup"].includes(journal.phase)) {
            await removeOwnedContainers(paths);
            await openInstallation(paths, journal.backup, journal.applied);
            await clearMaintenance(paths);
            throw new Error("Interrupted backup left data unchanged. Run ulvia upgrade again");
        }
        await restoreInstallationBackup(paths, journal.backup, log, journal);
        throw new Error("Interrupted upgrade was rolled back. Run ulvia upgrade again to retry");
    }
    await assertMaintenanceImage(target);
    const destination = resolve(
        backupDirectory ??
            join(`${paths.data}.backups`, `${new Date().toISOString().replaceAll(":", "-")}-${randomUUID()}`),
    );
    if (!backupDirectory) {
        await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    }
    await newBackupLocation(paths, destination);
    journal = {
        schema: "ulvia.maintenance/v1",
        kind: "upgrade",
        phase: "quiescing",
        backup: destination,
        applied,
        target,
        previous: { schema: "ulvia.local-services-stack.v1", applied, operation: null },
    };
    await saveMaintenance(paths, journal);
    try {
        await preparePresentation(paths, destination, applied, target);
        log("Public maintenance Pages captured and validated.");
        await composeStop(await deploymentProject(paths, applied), ["proxy"]);
        await startPresentation(paths, destination, applied);
        await stopDeployments(paths, journal.previous);
        await pauseProvider(paths);
        journal = { ...journal, phase: "backup" };
        await saveMaintenance(paths, journal);
        await createSnapshot(paths, destination, applied);
        log(`Verified rollback checkpoint: ${destination}`);
        await composeUp(await deploymentProject(paths, applied), ["mongo"]);
        journal = { ...journal, phase: "planning" };
        await saveMaintenance(paths, journal);
        const plan = await releaseMaintenance(paths, target);
        log(`Maintenance plan: ${plan.instances} instances, ${plan.forms} forms, ${plan.submissions} submissions.`);
        if (plan.migrations.length) {
            journal = { ...journal, phase: "migrating" };
            await saveMaintenance(paths, journal);
            await releaseMaintenance(paths, target, { digest: plan.digest, directory: join(destination, "migration") });
        }
        journal = { ...journal, phase: "deploying" };
        await saveMaintenance(paths, journal);
        const operation: DeploymentOperation = { kind: "upgrade", phase: "prepared", target };
        await executeDeployment(paths, applied, operation, log, async () => {
            journal = { ...journal!, phase: "opening" };
            await saveMaintenance(paths, journal);
            await activateProvider(paths, target);
            await stopPresentation(paths);
        });
        await clearMaintenance(paths);
    } catch (error) {
        const phase = (await readMaintenance(paths))?.phase;
        if (phase === "opening") {
            await startPresentation(paths, destination, applied);
            log(
                "Traffic opening has begun. No automatic data rollback is allowed; resume ulvia upgrade or request an explicit backup restore.",
            );
            throw error;
        }
        if (phase === "quiescing" || phase === "backup") {
            // No schema writes occurred; an incomplete snapshot cannot authorize a restore.
            await openInstallation(paths, destination, applied);
            await clearMaintenance(paths);
            throw error;
        }
        await restoreInstallationBackup(paths, destination, log, journal);
        const code = error instanceof Error ? /FORMS_[A-Z_]+/u.exec(error.message)?.[0] : undefined;
        throw new Error(
            `Upgrade failed before traffic opening. Previous installation restored.${code ? ` Diagnostic: ${code}.` : ""}`,
            { cause: error },
        );
    }
}
