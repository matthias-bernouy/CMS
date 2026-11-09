import type { UlviaPaths } from "../../paths";
import type { InstallationConfig } from "../installation";
import { defaultStackVersion } from "../version";
import {
    composeDown,
    composeLogs,
    composeStop,
    composeUp,
    checkProviderImageRetention,
    inspectComposeServices,
} from "./compose";
import { ensureOfficialImage, obtainOfficialImage, pullOfficialImage } from "./images";
import type { OfficialImageComponent } from "./images";
import { loadLocalServicesState, saveLocalServicesState } from "./state";
import type { LocalServicesState } from "./state";
import { assertUnpinnedStorageIsEmpty, serviceCredentials, serviceProject } from "./shared/project";
import { sharedEdgeNames, writeSharedComposeFiles } from "./shared/files";
import { announceControl } from "./shared/readiness";

export async function startLocalServices(
    paths: UlviaPaths,
    installation: InstallationConfig,
    log: (message: string) => void,
    requestedVersion?: string,
): Promise<void> {
    const installed = await loadLocalServicesState(paths);
    assertStartVersion(installed, requestedVersion);
    if (!installed) {
        await assertUnpinnedStorageIsEmpty(paths);
    }
    if (installed && installed.installation.hosting.controlOrigin !== installation.hosting.controlOrigin) {
        throw new Error("Control origin cannot change after the first infrastructure start");
    }
    const version = requestedVersion ?? (installed ? undefined : defaultStackVersion());
    const images = installed?.images ?? {
        provider: await obtainOfficialImage("provider", version!, log),
        edge: await obtainOfficialImage("edge", version!, log),
    };
    await Promise.all([ensureOfficialImage(images.provider), ensureOfficialImage(images.edge)]);
    const credentials = await serviceCredentials(paths);
    await writeSharedComposeFiles(paths, installation);
    // Persist the exact launch intent before Docker can create durable database state.
    const state = await saveLocalServicesState(paths, installation, images);
    log(`Starting Provider, MongoDB, Caddy and ${installation.hosting.edgeCount} shared Edge process(es)...`);
    await composeUp(serviceProject(paths, state, credentials));
    log(`Shared services are running (Provider ${images.provider.version}, Edge ${images.edge.version}).`);
    await announceControl(paths, state, log);
}
export function assertStartVersion(state: LocalServicesState | null, requestedVersion?: string): void {
    if (state && requestedVersion && Object.values(state.images).some((image) => image.version !== requestedVersion)) {
        throw new Error("Shared services are already pinned to different image versions. Use ulvia upgrade.");
    }
}
export async function upgradeLocalComponent(
    paths: UlviaPaths,
    component: OfficialImageComponent,
    version: string,
    log: (message: string) => void,
) {
    const installed = await requiredState(paths);
    const image = await pullOfficialImage(component, version, log);
    if (installed.images[component].digest === image.digest) {
        log(`${component} is already at ${version}.`);
        return;
    }
    const updated = { ...installed, images: { ...installed.images, [component]: image } };
    const credentials = await serviceCredentials(paths);
    await writeSharedComposeFiles(paths, installed.installation);
    if (component === "provider") {
        await checkProviderImageRetention(serviceProject(paths, updated, credentials));
    }
    try {
        await composeUp(serviceProject(paths, updated, credentials));
        await saveLocalServicesState(paths, updated.installation, updated.images);
    } catch (cause) {
        await composeUp(serviceProject(paths, installed, credentials)).catch(() => undefined);
        throw cause;
    }
    log(`${component} upgraded to ${version} (${image.digest.slice(0, 19)}…).`);
}
export async function stopLocalServices(paths: UlviaPaths): Promise<void> {
    await composeStop(serviceProject(paths, await requiredState(paths)));
}
export async function destroyLocalServices(paths: UlviaPaths): Promise<void> {
    await composeDown(serviceProject(paths, await requiredState(paths)));
}
export async function describeLocalServices(paths: UlviaPaths) {
    const state = await loadLocalServicesState(paths);
    return { state, services: state ? await inspectComposeServices(serviceProject(paths, state)) : [] };
}
async function requiredState(paths: UlviaPaths) {
    const state = await loadLocalServicesState(paths);
    if (!state) {
        throw new Error("Shared services are not initialized. Run ulvia services start first.");
    }
    return state;
}
export async function showServiceDiagnostics(paths: UlviaPaths, args: readonly string[]): Promise<void> {
    const state = await requiredState(paths);
    const allowed = new Set([
        "provider",
        "mongo",
        "proxy",
        "--follow",
        ...sharedEdgeNames(state.installation.hosting.edgeCount),
    ]);
    if (args.some((value) => !allowed.has(value))) {
        throw new Error("Usage: ulvia services logs [provider | mongo | proxy | edge-N] [--follow]");
    }
    await composeLogs(serviceProject(paths, state, await serviceCredentials(paths)), args);
}
