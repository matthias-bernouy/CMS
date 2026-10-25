import type { UlviaPaths } from "../../paths";
import { composeUp, inspectComposeServices } from "./compose";
import { listLocalInstanceNames, localKernelComposeProject, requireInstance, requireServices } from "./instances";
import { pullOfficialImage, type OfficialImage } from "./images";
import { requireRunningLocalProvider } from "./services";
import { loadLocalKernelState, localKernelProjectName, saveLocalKernelState } from "./state";
import type { LocalServicesState } from "./state";

export async function upgradeLocalKernels(
    paths: UlviaPaths,
    version: string,
    log: (message: string) => void,
): Promise<void> {
    const services = await requireServices(paths);
    await requireRunningLocalProvider(paths);
    const image = await pullOfficialImage("kernel", version, log);
    const names = await listLocalInstanceNames(paths);
    if (names.length === 0) {
        throw new Error("No local Kernel instances exist");
    }
    for (const name of names) {
        await upgradeLocalKernel(paths, name, services, image, log);
    }
}

async function upgradeLocalKernel(
    paths: UlviaPaths,
    name: string,
    services: LocalServicesState,
    image: OfficialImage,
    log: (message: string) => void,
): Promise<void> {
    const runtime = await requireInstance(paths, name);
    const installed = await loadLocalKernelState(runtime.paths);
    const projectName = installed?.projectName ?? localKernelProjectName(paths, name);
    if (installed?.image.digest === image.digest) {
        log(`Kernel ${name} is already at ${image.version}.`);
        return;
    }
    if (!installed) {
        await saveLocalKernelState(runtime.paths, projectName, runtime.config.hostname, image);
        log(`Kernel ${name} will use ${image.version} on its first start.`);
        return;
    }
    const currentProject = localKernelComposeProject(runtime, services, projectName, installed.image);
    const currentService = (await inspectComposeServices(currentProject)).find(({ service }) => service === "kernel");
    const isRunning = currentService?.state === "running";
    if (isRunning) {
        try {
            await composeUp(localKernelComposeProject(runtime, services, projectName, image));
        } catch (error) {
            await composeUp(currentProject).catch(() => undefined);
            throw error;
        }
    }
    await saveLocalKernelState(runtime.paths, projectName, runtime.config.hostname, image);
    log(`Kernel ${name} upgraded to ${image.version}${isRunning ? " and restarted" : ""}.`);
}
