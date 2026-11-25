import { composeUp } from "../../stack/orchestration/compose";
import { deploymentProject } from "../../stack/orchestration/deployment/artifacts";
import { sharedEdgeNames } from "../../stack/orchestration/shared/files";
import { startPresentation, stopPresentation } from "./frontend";
import { releaseProvider } from "../activation";
import type { UlviaPaths } from "../../paths";
import type { LocalServicesState } from "../../stack/orchestration/state";
/** Keep static Pages up while backend services recover, then hand the public ports back to the normal proxy. */
export async function openInstallation(paths: UlviaPaths, backup: string, state: LocalServicesState) {
    const project = await deploymentProject(paths, state);
    await releaseProvider(paths);
    try {
        await composeUp(project, ["mongo"]);
        await composeUp(project, ["provider"]);
        for (const edge of sharedEdgeNames(state.installation.hosting.edgeCount)) {
            await composeUp(project, [edge]);
        }
        await stopPresentation(paths);
        await composeUp(project);
    } catch (error) {
        await startPresentation(paths, backup, state);
        throw error;
    }
}
