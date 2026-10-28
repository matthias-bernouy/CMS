import type { UlviaPaths } from "../../paths";
import { composeUp, inspectComposeServices } from "./compose";
import { listLocalInstanceNames, localEdgeComposeProject, requireInstance, requireServices } from "./instances";
import { pullOfficialImage, type OfficialImage } from "./images";
import { requireRunningLocalProvider } from "./services";
import { loadLocalEdgeState, localEdgeProjectName, saveLocalEdgeState } from "./state";
import type { LocalServicesState } from "./state";

export async function upgradeLocalEdges(
    paths: UlviaPaths,
    version: string,
    log: (message: string) => void,
): Promise<void> {
    const services = await requireServices(paths);
    await requireRunningLocalProvider(paths);
    const image = await pullOfficialImage("edge", version, log);
    const names = await listLocalInstanceNames(paths);
    if (names.length === 0) {
        throw new Error("No local Edge instances exist");
    }
    for (const name of names) {
        await upgradeLocalEdge(paths, name, services, image, log);
    }
}

async function upgradeLocalEdge(
    paths: UlviaPaths,
    name: string,
    services: LocalServicesState,
    image: OfficialImage,
    log: (message: string) => void,
): Promise<void> {
    const runtime = await requireInstance(paths, name);
    const installed = await loadLocalEdgeState(runtime.paths);
    const projectName = installed?.projectName ?? localEdgeProjectName(paths, name);
    if (installed?.image.digest === image.digest) {
        log(`Edge ${name} is already at ${image.version}.`);
        return;
    }
    if (!installed) {
        await saveLocalEdgeState(runtime.paths, projectName, runtime.config.hostname, image);
        log(`Edge ${name} will use ${image.version} on its first start.`);
        return;
    }
    const currentProject = localEdgeComposeProject(runtime, services, projectName, installed.image);
    const currentService = (await inspectComposeServices(currentProject)).find(({ service }) => service === "edge");
    const isRunning = currentService?.state === "running";
    if (isRunning) {
        try {
            await composeUp(localEdgeComposeProject(runtime, services, projectName, image));
        } catch (error) {
            await composeUp(currentProject).catch(() => undefined);
            throw error;
        }
    }
    await saveLocalEdgeState(runtime.paths, projectName, runtime.config.hostname, image);
    log(`Edge ${name} upgraded to ${image.version}${isRunning ? " and restarted" : ""}.`);
}
