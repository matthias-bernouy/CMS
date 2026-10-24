import {
    loadOrCreateLocalServicesConfig,
    loadOrCreateProviderOperatorToken,
    loadOrCreateRepositoryToken,
} from "../../config";
import type { UlviaPaths } from "../../paths";
import type { InstallationConfig } from "../installation";
import { composeDown, composeStop, composeUp, inspectComposeServices, type ComposeProject } from "./compose";
import { localServicesEnvironment } from "./environment";
import { ensureLocalServiceImages, LOCAL_STACK_VERSION } from "./release";
import { loadLocalServicesState, localServicesIdentity, saveLocalServicesState } from "./state";

export async function startLocalServices(
    paths: UlviaPaths,
    installation: InstallationConfig,
    log: (message: string) => void,
    options: Readonly<{ allowUpgrade?: boolean; prepare?: () => Promise<void> }> = {},
): Promise<void> {
    const installed = await loadLocalServicesState(paths);
    assertVersion(installed?.version, options.allowUpgrade);
    if (options.allowUpgrade && installed?.version === LOCAL_STACK_VERSION) {
        log(`Shared services are already at ${LOCAL_STACK_VERSION}.`);
        return;
    }
    await options.prepare?.();
    await ensureLocalServiceImages(log);
    const credentials = {
        config: await loadOrCreateLocalServicesConfig(paths.services),
        repositoryToken: await loadOrCreateRepositoryToken(paths.services),
        operatorToken: await loadOrCreateProviderOperatorToken(paths.services),
    };
    const identity = localServicesIdentity(paths);
    const project: ComposeProject = {
        definition: "services",
        projectName: identity.projectName,
        overlays: installation.tls.mode === "acme" ? ["services-tls"] : [],
        environment: localServicesEnvironment(paths, installation, identity, credentials),
    };
    log("Starting the local proxy, MongoDB, Repository, and Provider...");
    await composeUp(project);
    await saveLocalServicesState(paths, installation);
    log(`Shared services ${LOCAL_STACK_VERSION} are ready.`);
}

export async function stopLocalServices(paths: UlviaPaths, installation: InstallationConfig): Promise<void> {
    await composeStop(await localServicesProject(paths, installation));
}

export async function destroyLocalServices(paths: UlviaPaths, installation: InstallationConfig): Promise<void> {
    await composeDown(await localServicesProject(paths, installation));
}

export async function describeLocalServices(paths: UlviaPaths, installation: InstallationConfig) {
    const state = await loadLocalServicesState(paths);
    const project = await localServicesProject(paths, state?.installation ?? installation);
    return { state, services: await inspectComposeServices(project) };
}

export async function requireRunningLocalProvider(paths: UlviaPaths, installation: InstallationConfig) {
    const described = await describeLocalServices(paths, installation);
    const provider = described.services.find(({ service }) => service === "provider");
    if (
        !described.state ||
        provider?.state !== "running" ||
        (provider.health.length > 0 && provider.health !== "healthy")
    ) {
        throw new Error("The shared Provider is not running. Run ulvia services start first.");
    }
    return described.state;
}

async function localServicesProject(paths: UlviaPaths, installation: InstallationConfig): Promise<ComposeProject> {
    const state = await loadLocalServicesState(paths);
    const activeInstallation = state?.installation ?? installation;
    const identity = state ?? { ...localServicesIdentity(paths), installation: activeInstallation };
    return {
        definition: "services",
        overlays: activeInstallation.tls.mode === "acme" ? ["services-tls"] : [],
        projectName: identity.projectName,
        environment: localServicesEnvironment(paths, activeInstallation, identity),
    };
}

function assertVersion(installed: string | undefined, allowUpgrade: boolean | undefined): void {
    if (installed && installed !== LOCAL_STACK_VERSION && !allowUpgrade) {
        throw new Error(
            `Shared services ${installed} require an explicit upgrade to ${LOCAL_STACK_VERSION}: ulvia services upgrade`,
        );
    }
}
