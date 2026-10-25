import { readdir } from "node:fs/promises";
import { loadOrCreateProviderOperatorToken } from "../../config";
import type { LocalInstanceConfig } from "../../instanceConfig";
import { loadLocalInstanceConfig } from "../../instanceConfig";
import type { LocalInstanceConnection } from "../../instanceConnection";
import { loadLocalInstanceConnection } from "../../instanceConnection";
import {
    assertLocalInstancePaths,
    resolveLocalInstancePaths,
    type LocalInstancePaths,
    type UlviaPaths,
} from "../../paths";
import { instancePublicUrl } from "../ports";
import { composeDown, composeStop, composeUp, inspectComposeServices, type ComposeProject } from "./compose";
import { localKernelEnvironment } from "./environment";
import { ensureOfficialImage, pullOfficialImage, type OfficialImage } from "./images";
import { requireRunningLocalProvider } from "./services";
import { loadLocalKernelState, loadLocalServicesState, localKernelProjectName, saveLocalKernelState } from "./state";
import type { LocalServicesState } from "./state";

export async function startLocalKernel(paths: UlviaPaths, name: string, log: (message: string) => void): Promise<void> {
    const runtime = await requireInstance(paths, name);
    const services = await requireServices(paths);
    await requireRunningLocalProvider(paths);
    const installed = await loadLocalKernelState(runtime.paths);
    const image = installed?.image ?? (await pullOfficialImage("kernel", services.images.provider.version, log));
    await ensureOfficialImage(image);
    const projectName = installed?.projectName ?? localKernelProjectName(paths, name);
    await composeUp(kernelProject(runtime.paths, runtime.config, runtime.connection, services, projectName, image));
    await saveLocalKernelState(runtime.paths, projectName, runtime.config.hostname, image);
    const publicUrl = instancePublicUrl(runtime.config.hostname, services.installation);
    await waitForProxyRoute(runtime.config.hostname, services.installation);
    log(`Instance ${name} is ready at ${publicUrl}.`);
}

export async function stopLocalKernel(paths: UlviaPaths, name: string): Promise<void> {
    await composeStop(await projectForExistingInstance(paths, name));
}

export async function destroyLocalKernel(paths: UlviaPaths, name: string): Promise<void> {
    await composeDown(await projectForExistingInstance(paths, name));
}

export async function describeLocalKernel(paths: UlviaPaths, name: string) {
    const runtime = await requireInstance(paths, name);
    const state = await loadLocalKernelState(runtime.paths);
    const services = await requireServices(paths);
    const projectName = state?.projectName ?? localKernelProjectName(paths, name);
    return {
        config: runtime.config,
        state,
        services: state
            ? await inspectComposeServices(
                  kernelProject(runtime.paths, runtime.config, runtime.connection, services, projectName, state.image),
              )
            : [],
        url: instancePublicUrl(runtime.config.hostname, services.installation),
    };
}

export async function listLocalInstanceNames(paths: UlviaPaths): Promise<string[]> {
    const entries = await readdir(paths.instances, { withFileTypes: true });
    return entries
        .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
        .map(({ name }) => name)
        .sort();
}

async function projectForExistingInstance(paths: UlviaPaths, name: string): Promise<ComposeProject> {
    const runtime = await requireInstance(paths, name);
    const services = await requireServices(paths);
    const state = await loadLocalKernelState(runtime.paths);
    if (!state) {
        throw new Error(`Local instance ${name} has not been started`);
    }
    return kernelProject(runtime.paths, runtime.config, runtime.connection, services, state.projectName, state.image);
}

export function localKernelComposeProject(
    runtime: Awaited<ReturnType<typeof requireInstance>>,
    services: LocalServicesState,
    projectName: string,
    image: OfficialImage,
): ComposeProject {
    return kernelProject(runtime.paths, runtime.config, runtime.connection, services, projectName, image);
}

function kernelProject(
    paths: LocalInstancePaths,
    config: LocalInstanceConfig,
    connection: LocalInstanceConnection,
    services: NonNullable<Awaited<ReturnType<typeof loadLocalServicesState>>>,
    projectName: string,
    image: OfficialImage,
): ComposeProject {
    return {
        definition: "kernel",
        overlays: services.installation.tls.mode === "acme" ? ["kernel-tls"] : [],
        projectName,
        environment: localKernelEnvironment(paths, config, connection, services, image),
    };
}

export async function requireInstance(paths: UlviaPaths, name: string) {
    const instancePaths = resolveLocalInstancePaths(paths, name);
    await assertLocalInstancePaths(instancePaths);
    const [config, connection] = await Promise.all([
        loadLocalInstanceConfig(instancePaths.root),
        loadLocalInstanceConnection(instancePaths.root),
    ]);
    if (!config || !connection) {
        throw new Error(`Unknown local instance: ${name}`);
    }
    if (config.name !== name) {
        throw new Error(`Local instance identity is invalid: ${name}`);
    }
    return { paths: instancePaths, config, connection };
}

export async function requireServices(paths: UlviaPaths) {
    const services = await loadLocalServicesState(paths);
    if (!services) {
        throw new Error("Shared services are not initialized. Run ulvia services start first.");
    }
    return services;
}

export async function providerOperatorAccess(paths: UlviaPaths, services: LocalServicesState) {
    return {
        url: `http://127.0.0.1:${services.installation.ports.provider}`,
        token: await loadOrCreateProviderOperatorToken(paths.services),
    };
}

async function waitForProxyRoute(hostname: string, installation: LocalServicesState["installation"]): Promise<void> {
    const deadline = Date.now() + 90_000;
    const proxyUrl = `http://127.0.0.1:${installation.ports.http}/readyz`;
    while (Date.now() < deadline) {
        const ready = await fetch(proxyUrl, {
            headers: { host: hostname },
            redirect: "manual",
            signal: AbortSignal.timeout(15_000),
        }).then(
            async (response) => {
                await response.body?.cancel();
                return response.status < 500;
            },
            () => false,
        );
        if (ready) {
            return;
        }
        await Bun.sleep(250);
    }
    throw new Error(`Instance proxy route did not become ready: ${hostname}`);
}
