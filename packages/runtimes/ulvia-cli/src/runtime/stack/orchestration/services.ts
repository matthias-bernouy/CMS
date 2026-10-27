import { loadOrCreateLocalServicesConfig, loadOrCreateProviderOperatorToken } from "../../config";
import type { UlviaPaths } from "../../paths";
import type { InstallationConfig } from "../installation";
import { defaultStackVersion } from "../version";
import {
    checkProviderImageRetention,
    composeDown,
    composeLogs,
    composeStop,
    composeUp,
    inspectComposeServices,
    type ComposeProject,
} from "./compose";
import { localServicesEnvironment } from "./environment";
import { ensureOfficialImage, pullOfficialImage, type OfficialImageComponent } from "./images";
import { loadLocalServicesState, localServicesIdentity, saveLocalServicesState } from "./state";
import type { LocalServicesState } from "./state";

export async function startLocalServices(
    paths: UlviaPaths,
    installation: InstallationConfig,
    log: (message: string) => void,
    requestedVersion?: string,
): Promise<void> {
    const installed = await loadLocalServicesState(paths);
    assertStartVersion(installed, requestedVersion);
    const images = installed?.images ?? (await pullInitialImages(requestedVersion ?? defaultStackVersion(), log));
    await ensureOfficialImage(images.provider);
    await ensureOfficialImage(images.repository);
    const credentials = await serviceCredentials(paths);
    const identity = { ...localServicesIdentity(paths), images };
    const project: ComposeProject = {
        definition: "services",
        projectName: identity.projectName,
        overlays: installation.tls.mode === "acme" ? ["services-tls"] : [],
        environment: localServicesEnvironment(paths, installation, identity, credentials),
    };
    log("Starting the local proxy, MongoDB, Repository, and Provider...");
    await composeUp(project);
    await saveLocalServicesState(paths, installation, images);
    log(`Shared services are ready (Provider ${images.provider.version}, Repository ${images.repository.version}).`);
}

async function pullInitialImages(version: string, log: (message: string) => void) {
    const [provider, repository] = await Promise.all([
        pullOfficialImage("provider", version, log),
        pullOfficialImage("repository", version, log),
    ]);
    return { provider, repository };
}

export function assertStartVersion(state: LocalServicesState | null, requestedVersion?: string): void {
    if (!state || !requestedVersion) {
        return;
    }
    const current = new Set([state.images.provider.version, state.images.repository.version]);
    if (current.size !== 1 || !current.has(requestedVersion)) {
        throw new Error(
            "Shared services are already initialized with different versions. Use ulvia upgrade provider and ulvia upgrade repository.",
        );
    }
}

export async function upgradeLocalService(
    paths: UlviaPaths,
    component: Exclude<OfficialImageComponent, "kernel">,
    version: string,
    log: (message: string) => void,
): Promise<void> {
    const installed = await loadLocalServicesState(paths);
    if (!installed) {
        throw new Error("Shared services are not initialized. Run ulvia services start first.");
    }
    const image = await pullOfficialImage(component, version, log);
    if (installed.images[component].digest === image.digest) {
        log(`${serviceName(component)} is already at ${version}.`);
        return;
    }
    const updated: LocalServicesState = {
        ...installed,
        images: { ...installed.images, [component]: image },
    };
    const credentials = await serviceCredentials(paths);
    if (component === "provider") {
        await checkProviderImageRetention(serviceProject(paths, updated, credentials));
    }
    try {
        await composeUp(serviceProject(paths, updated, credentials));
        await saveLocalServicesState(paths, updated.installation, updated.images);
    } catch (error) {
        await composeUp(serviceProject(paths, installed, credentials)).catch(() => undefined);
        throw error;
    }
    log(`${serviceName(component)} upgraded to ${version} (${image.digest.slice(0, 19)}…).`);
}

export async function stopLocalServices(paths: UlviaPaths): Promise<void> {
    await composeStop(await localServicesProject(paths));
}

export async function destroyLocalServices(paths: UlviaPaths): Promise<void> {
    await composeDown(await localServicesProject(paths));
}

export async function describeLocalServices(paths: UlviaPaths) {
    const state = await loadLocalServicesState(paths);
    if (!state) {
        return { state: null, services: [] };
    }
    const project = await localServicesProject(paths);
    return { state, services: await inspectComposeServices(project) };
}

export async function requireRunningLocalProvider(paths: UlviaPaths) {
    const described = await describeLocalServices(paths);
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

async function localServicesProject(paths: UlviaPaths): Promise<ComposeProject> {
    const state = await loadLocalServicesState(paths);
    if (!state) {
        throw new Error("Shared services are not initialized. Run ulvia services start first.");
    }
    return serviceProject(paths, state);
}

function serviceProject(
    paths: UlviaPaths,
    state: LocalServicesState,
    credentials?: Awaited<ReturnType<typeof serviceCredentials>>,
): ComposeProject {
    return {
        definition: "services",
        overlays: state.installation.tls.mode === "acme" ? ["services-tls"] : [],
        projectName: state.projectName,
        environment: localServicesEnvironment(paths, state.installation, state, credentials),
    };
}

async function serviceCredentials(paths: UlviaPaths) {
    return {
        config: await loadOrCreateLocalServicesConfig(paths.services),
        operatorToken: await loadOrCreateProviderOperatorToken(paths.services),
    };
}

function serviceName(component: Exclude<OfficialImageComponent, "kernel">): string {
    return component === "provider" ? "Provider" : "Repository";
}

export async function showServiceDiagnostics(paths: UlviaPaths, args: readonly string[]): Promise<void> {
    const state = await loadLocalServicesState(paths);
    if (!state) {
        throw new Error("Shared services are not initialized");
    }
    const allowed = new Set(["provider", "repository", "mongo", "proxy", "--follow"]);
    if (args.some((value) => !allowed.has(value))) {
        throw new Error("Usage: ulvia services logs [provider | repository | mongo | proxy] [--follow]");
    }
    await composeLogs(serviceProject(paths, state, await serviceCredentials(paths)), args);
}
