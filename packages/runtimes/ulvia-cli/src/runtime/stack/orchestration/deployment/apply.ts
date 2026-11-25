import { protectedUpgrade } from "../../../maintenance/upgrade";
import { readMaintenance } from "../../../maintenance/journal";
import { releaseMaintenance, assertMaintenanceImage } from "../../../maintenance/migration";
import { readDeploymentState } from "../state";
import { loadOrCreateInstallationConfig } from "../../installation";
import { defaultStackVersion } from "../../version";
import { resolveStackRelease } from "../../releases/resolve";
import { ensureOfficialImage, obtainOfficialImage, pullOfficialImage } from "../images";
import { assertUnpinnedStorageIsEmpty } from "../shared/project";
import { prepareDeployment, deploymentProject } from "./artifacts";
import { inspectComposeServices } from "../compose";
import { sharedEdgeNames } from "../shared/files";
import { executeDeployment, assertInfrastructureUpgrade, prepareInfrastructureImages } from "./execute";
import { announceControl } from "../shared/readiness";
import type { UlviaPaths } from "../../../paths";

export async function applyInstallation(
    paths: UlviaPaths,
    environment: Record<string, string | undefined>,
    log: (line: string) => void,
    version?: string,
    kind: "apply" | "upgrade" = "apply",
    options: { plan?: boolean; backupDirectory?: string } = {},
): Promise<void> {
    const maintenance = await readMaintenance(paths);
    if (maintenance) {
        if (
            kind !== "upgrade" ||
            maintenance.kind !== "upgrade" ||
            !maintenance.target ||
            (version && version !== maintenance.target.release.version)
        ) {
            throw new Error("Resume the recorded maintenance operation first");
        }
        if (options.plan) {
            log(`Upgrade recovery: ${maintenance.phase}`);
            return;
        }
        await protectedUpgrade(paths, maintenance.applied, maintenance.target, log);
        return;
    }
    const state = await readDeploymentState(paths);
    const desired = await loadOrCreateInstallationConfig(paths, environment);
    const applied = state?.applied ?? null;
    if (
        applied &&
        (desired.hosting.controlOrigin !== applied.installation.hosting.controlOrigin ||
            !sameConfiguration(
                { bindAddress: desired.bindAddress, ports: desired.ports, tls: desired.tls },
                {
                    bindAddress: applied.installation.bindAddress,
                    ports: applied.installation.ports,
                    tls: applied.installation.tls,
                },
            ))
    ) {
        throw new Error("Control origin and network configuration are locked after the first deployment");
    }
    if (state?.operation) {
        const operation = state.operation;
        if (
            operation.kind !== kind ||
            (version && version !== operation.target.release.version) ||
            !sameConfiguration(desired, operation.target.installation)
        ) {
            throw new Error(
                `A deployment is pending. Restore its desired configuration and run ulvia ${operation.kind} to resume it`,
            );
        }
        if (kind === "upgrade") {
            throw new Error(
                "This pending upgrade has no verified rollback checkpoint. Finish it with its original CLI or explicitly restore an installation backup",
            );
        }
        await Promise.all(Object.values(operation.target.images).map(ensureOfficialImage));
        await prepareInfrastructureImages(operation.target);
        await executeDeployment(paths, applied, operation, log);
        await announceControl(paths, operation.target, log);
        return;
    }
    if (kind === "upgrade" && !applied) {
        throw new Error("No applied installation. Run ulvia apply first");
    }
    if (kind === "upgrade" && !sameConfiguration(desired, applied!.installation)) {
        throw new Error("Configuration changes are pending. Run ulvia apply before upgrading");
    }
    if (kind === "apply" && applied && version && version !== applied.release.version) {
        throw new Error("Use ulvia upgrade to change the stack release");
    }
    if (kind === "apply" && applied && sameConfiguration(desired, applied.installation)) {
        const services = await inspectComposeServices(await deploymentProject(paths, applied));
        const names = ["mongo", "provider", "proxy", ...sharedEdgeNames(applied.installation.hosting.edgeCount)];
        if (
            names.every((name) =>
                services.some(
                    (row) =>
                        row.service === name && row.state === "running" && (!row.health || row.health === "healthy"),
                ),
            )
        ) {
            log("Configuration is already applied.");
            return;
        }
        await Promise.all(Object.values(applied.images).map(ensureOfficialImage));
        await prepareInfrastructureImages(applied);
        await executeDeployment(paths, applied, { kind, phase: "prepared", target: applied }, log);
        await announceControl(paths, applied, log);
        return;
    }
    if (!applied) {
        await assertUnpinnedStorageIsEmpty(paths);
    }
    const releaseVersion = version ?? (kind === "apply" && applied ? applied.release.version : defaultStackVersion());
    const release = kind === "apply" && applied ? applied.release : await resolveStackRelease(releaseVersion, !applied);
    const acquire = kind === "upgrade" ? pullOfficialImage : obtainOfficialImage;
    const images =
        kind === "apply" && applied
            ? applied.images
            : {
                  provider: await acquire("provider", release.version, log),
                  edge: await acquire("edge", release.version, log),
              };
    await Promise.all(Object.values(images).map(ensureOfficialImage));
    if (
        kind === "upgrade" &&
        applied &&
        release.digest === applied.release.digest &&
        sameConfiguration(images, applied.images)
    ) {
        log(`Stack ${release.version} is already applied.`);
        return;
    }
    const target = await prepareDeployment(paths, desired, release, images);
    if (applied) {
        assertInfrastructureUpgrade(applied, target);
    }
    await prepareInfrastructureImages(target);
    if (kind === "upgrade" && applied) {
        if (options.plan) {
            await assertMaintenanceImage(target);
            const services = await inspectComposeServices(await deploymentProject(paths, applied));
            if (!services.some((row) => row.service === "mongo" && row.state === "running")) {
                throw new Error("Start the installation before inspecting an upgrade plan");
            }
            const plan = await releaseMaintenance(paths, target);
            log(JSON.stringify({ targetVersion: target.release.version, ...plan }));
            return;
        }
        await protectedUpgrade(paths, applied, target, log, options.backupDirectory);
    } else {
        await executeDeployment(paths, applied, { kind, phase: "prepared", target }, log);
    }
    await announceControl(paths, target, log);
}

export function sameConfiguration(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}
