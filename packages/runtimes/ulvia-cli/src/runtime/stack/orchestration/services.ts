import { readDeploymentState } from "./state";
import { deploymentProject } from "./deployment/artifacts";
import { composeDown, composeStop, composeStart, inspectComposeServices } from "./compose";
import { sharedEdgeNames } from "./shared/files";
import { serviceCredentials } from "./shared/project";
import { announceControl } from "./shared/readiness";
import type { UlviaPaths } from "../../paths";

export async function startLocalServices(paths: UlviaPaths, log: (line: string) => void): Promise<void> {
    const state = await readDeploymentState(paths);
    if (state?.operation) {
        throw new Error(`Deployment is incomplete. Run ulvia ${state.operation.kind} to resume it`);
    }
    if (!state?.applied) {
        throw new Error("No applied deployment. Run ulvia apply first");
    }
    await serviceCredentials(paths);
    const project = await deploymentProject(paths, state.applied);
    const services = await inspectComposeServices(project);
    const expected = ["mongo", "provider", "proxy", ...sharedEdgeNames(state.applied.installation.hosting.edgeCount)];
    if (!expected.every((name) => services.some(({ service }) => service === name))) {
        throw new Error("Applied containers are missing. Run ulvia apply to recreate the recorded deployment");
    }
    await composeStart(project);
    await announceControl(paths, state.applied, log);
}
export async function stopLocalServices(paths: UlviaPaths): Promise<void> {
    const state = await requiredState(paths);
    for (const deployment of [state.applied, state.operation?.target]) {
        if (deployment) {
            await composeStop(await deploymentProject(paths, deployment));
        }
    }
}
export async function destroyLocalServices(paths: UlviaPaths): Promise<void> {
    const state = await requiredState(paths);
    const target = state.operation?.target ?? state.applied!;
    await composeDown(await deploymentProject(paths, target));
}
export async function describeLocalServices(paths: UlviaPaths) {
    const state = await readDeploymentState(paths);
    const target = state?.operation?.target ?? state?.applied;
    return { state, services: target ? await inspectComposeServices(await deploymentProject(paths, target)) : [] };
}
async function requiredState(paths: UlviaPaths) {
    const state = await readDeploymentState(paths);
    if (!state) {
        throw new Error("Installation has not been applied. Run ulvia apply first");
    }
    return state;
}
