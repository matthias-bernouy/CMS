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
import { ensureOfficialImage, obtainOfficialImage, pullOfficialImage } from "./images";
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
    const images = installed?.images ?? {
        provider: await obtainOfficialImage("provider", requestedVersion ?? defaultStackVersion(), log),
    };
    await ensureOfficialImage(images.provider);
    const credentials = await serviceCredentials(paths);
    const identity = { ...localServicesIdentity(paths), images };
    const project: ComposeProject = {
        definition: "services",
        projectName: identity.projectName,
        overlays: installation.tls.mode === "acme" ? ["services-tls"] : [],
        environment: localServicesEnvironment(paths, installation, identity, credentials),
    };
    log("Starting the local proxy, MongoDB, and Provider...");
    await composeUp(project);
    await saveLocalServicesState(paths, installation, images);
    log(`Shared services are ready (Provider ${images.provider.version}).`);
}

export function assertStartVersion(state: LocalServicesState | null, requestedVersion?: string): void {
    if (!state || !requestedVersion) {
        return;
    }
    if (state.images.provider.version !== requestedVersion) {
        throw new Error(
            "Shared services are already initialized with a different Provider version. Use ulvia upgrade provider.",
        );
    }
}

export async function upgradeLocalProvider(
    paths: UlviaPaths,
    version: string,
    log: (message: string) => void,
): Promise<void> {
    const installed = await loadLocalServicesState(paths);
    if (!installed) {
        throw new Error("Shared services are not initialized. Run ulvia services start first.");
    }
    const image = await pullOfficialImage("provider", version, log);
    if (installed.images.provider.digest === image.digest) {
        log(`Provider is already at ${version}.`);
        return;
    }
    const updated: LocalServicesState = {
        ...installed,
        images: { ...installed.images, provider: image },
    };
    const credentials = await serviceCredentials(paths);
    await checkProviderImageRetention(serviceProject(paths, updated, credentials));
    try {
        await composeUp(serviceProject(paths, updated, credentials));
        await saveLocalServicesState(paths, updated.installation, updated.images);
    } catch (error) {
        await composeUp(serviceProject(paths, installed, credentials)).catch(() => undefined);
        throw error;
    }
    log(`Provider upgraded to ${version} (${image.digest.slice(0, 19)}…).`);
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

export async function showServiceDiagnostics(paths: UlviaPaths, args: readonly string[]): Promise<void> {
    const state = await loadLocalServicesState(paths);
    if (!state) {
        throw new Error("Shared services are not initialized");
    }
    const allowed = new Set(["provider", "mongo", "proxy", "--follow"]);
    if (args.some((value) => !allowed.has(value))) {
        throw new Error("Usage: ulvia services logs [provider | mongo | proxy] [--follow]");
    }
    await composeLogs(serviceProject(paths, state, await serviceCredentials(paths)), args);
}
