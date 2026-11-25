import { composeUp, checkProviderImageRetention } from "../compose";
import { deploymentProject } from "./artifacts";
import { saveDeploymentState } from "../state";
import { sharedEdgeNames } from "../shared/files";
import { runCommand } from "../../../process";
import type { DeploymentOperation, LocalServicesState } from "../state";
import type { UlviaPaths } from "../../../paths";

export async function executeDeployment(
    paths: UlviaPaths,
    applied: LocalServicesState | null,
    operation: DeploymentOperation,
    log: (line: string) => void,
    beforeProxy?: () => Promise<void>,
): Promise<void> {
    const target = operation.target;
    const project = await deploymentProject(paths, target);
    // All artifacts and credentials exist before a durable intent can authorize Docker writes.
    await saveDeploymentState(paths, applied, { ...operation, phase: "prepared" });
    try {
        if (operation.kind === "upgrade") {
            if (applied) {
                await composeUp(project, ["mongo"]);
            }
            await checkProviderImageRetention(project);
        }
        if (applied) {
            await composeUp(project, ["mongo"]);
            await composeUp(project, ["provider"]);
            await saveDeploymentState(paths, applied, { ...operation, phase: "provider" });
            for (const name of sharedEdgeNames(target.installation.hosting.edgeCount)) {
                await composeUp(project, [name]);
            }
            await saveDeploymentState(paths, applied, { ...operation, phase: "edges" });
            await beforeProxy?.();
            await composeUp(project, ["proxy"]);
            await saveDeploymentState(paths, applied, { ...operation, phase: "proxy" });
        }
        await composeUp(project);
    } catch (error) {
        await saveDeploymentState(paths, applied, { ...operation, phase: "failed" });
        log(`Deployment interrupted. Run ulvia ${operation.kind} to resume the recorded target; inspect ulvia status.`);
        throw error;
    }
    // Commit outside the Docker-error handler: a failed/uncertain state write must
    // never overwrite a potentially committed new snapshot with the old release.
    await saveDeploymentState(paths, target, null);
    log(`Applied stack ${target.release.version} (${target.installation.hosting.edgeCount} shared Edges).`);
}

export function assertInfrastructureUpgrade(applied: LocalServicesState, target: LocalServicesState): void {
    const version = (state: LocalServicesState) =>
        mongoImage(state)
            .match(/^mongo:(\d+)\.(\d+)\.(\d+)/u)
            ?.slice(1)
            .map(Number);
    const previous = version(applied);
    const next = version(target);
    if (
        !previous ||
        !next ||
        previous[0] !== next[0] ||
        next.some(
            (value, index) =>
                value !== previous[index] &&
                next.slice(0, index).every((part, i) => part === previous[i]) &&
                value < previous[index]!,
        )
    ) {
        throw new Error("MongoDB major changes and downgrades require an explicit data migration");
    }
}

export async function prepareInfrastructureImages(state: LocalServicesState): Promise<void> {
    const services = state.release.files["services.yml"];
    const images = [
        ...new Set(
            [...services.matchAll(/image: ((?:mongo|caddy):[^\s]+@sha256:[a-f0-9]{64})/gu)].map((match) => match[1]!),
        ),
    ];
    for (const image of images) {
        const found = await runCommand(["docker", "image", "inspect", image], { allowFailure: true });
        if (found.exitCode !== 0) {
            await runCommand(["docker", "pull", image], { inherit: true });
        }
    }
}
function mongoImage(state: LocalServicesState): string {
    return state.release.files["services.yml"].match(/image: (mongo:[^\s]+)/u)![1]!;
}
