import { startPresentation } from "../presentation/frontend";
import { openInstallation } from "../presentation/open";
import { removeOwnedContainers } from "../containers";
import { resolve } from "node:path";
import { readDeploymentState } from "../../stack/orchestration/state";
import { deploymentProject } from "../../stack/orchestration/deployment/artifacts";
import { composeStop, composeUp, inspectComposeServices } from "../../stack/orchestration/compose";
import { pinnedOfficialImageReference } from "../../stack/orchestration/images";
import { createSnapshot, verifySnapshot, newBackupLocation } from "./snapshot";
import { treeInContainer } from "./docker";
import { readMaintenance, saveMaintenance, clearMaintenance } from "../journal";
import type { MaintenanceJournal } from "../journal";
import type { UlviaPaths } from "../../paths";
import type { DeploymentState, LocalServicesState } from "../../stack/orchestration/state";
export async function stopDeployments(paths: UlviaPaths, state: DeploymentState | null, fallback?: LocalServicesState) {
    const deployments = [state?.applied, state?.operation?.target, fallback].filter(
        (value): value is LocalServicesState => Boolean(value),
    );
    const seen = new Set<string>();
    for (const deployment of deployments) {
        if (seen.has(deployment.id)) {
            continue;
        }
        seen.add(deployment.id);
        const project = await deploymentProject(paths, deployment);
        await composeStop(project);
        if (
            (await inspectComposeServices(project)).some((row) =>
                ["running", "restarting", "paused"].includes(row.state),
            )
        ) {
            throw new Error("Installation services must be stopped before copying persistent data");
        }
    }
}
export async function createInstallationBackup(paths: UlviaPaths, destination: string, log: (value: string) => void) {
    if (await readMaintenance(paths)) {
        throw new Error("Finish the pending maintenance operation before creating a backup");
    }
    const state = await readDeploymentState(paths);
    if (!state?.applied || state.operation) {
        throw new Error("Backup requires a complete applied deployment");
    }
    await newBackupLocation(paths, destination);
    const project = await deploymentProject(paths, state.applied);
    const resume = (await inspectComposeServices(project)).some(
        (row) => row.service === "provider" && row.state === "running",
    );
    await stopDeployments(paths, state);
    try {
        const backup = await createSnapshot(paths, destination, state.applied);
        log(`Verified installation backup: ${backup}`);
        return backup;
    } finally {
        if (resume) {
            await composeUp(project);
        }
    }
}
/** A failed restore retains its journal. Retry never recopies data once traffic opening has begun. */
export async function restoreInstallationBackup(
    paths: UlviaPaths,
    backup: string,
    log: (value: string) => void,
    existing?: MaintenanceJournal,
) {
    backup = resolve(backup);
    const saved = await verifySnapshot(paths, backup);
    let journal = existing ?? (await readMaintenance(paths));
    if (journal && journal.backup !== backup) {
        throw new Error("Pending maintenance must be resumed before requesting a different rollback");
    }
    if (!existing && journal?.kind === "upgrade" && !journal.phase.startsWith("rollback-")) {
        journal = null;
    }
    if (!journal) {
        journal = {
            schema: "ulvia.maintenance/v1",
            kind: "restore",
            phase: "rollback-stopping",
            backup,
            applied: saved.state,
            target: null,
            // A verified checkpoint is sufficient even when live launch metadata is damaged.
            previous: null,
        };
        await saveMaintenance(paths, journal);
    }
    if (journal.phase !== "rollback-opening") {
        journal = { ...journal, phase: "rollback-stopping" };
        await saveMaintenance(paths, journal);
        await removeOwnedContainers(paths);
        await startPresentation(paths, backup, saved.state);
        journal = { ...journal, phase: "rollback-restoring" };
        await saveMaintenance(paths, journal);
        await treeInContainer("restore", paths, backup, pinnedOfficialImageReference(saved.state.images.provider));
        journal = { ...journal, phase: "rollback-opening" };
        await saveMaintenance(paths, journal);
    }
    await openInstallation(paths, backup, saved.state);
    await clearMaintenance(paths);
    log(`Restored stack ${saved.state.release.version} and installation data from ${saved.record.createdAt}.`);
}
