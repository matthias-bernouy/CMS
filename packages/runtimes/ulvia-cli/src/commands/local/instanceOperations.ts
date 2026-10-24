import { rm } from "node:fs/promises";
import { disableLocalInstance } from "../../runtime/instance";
import { loadLocalInstanceConfig } from "../../runtime/instanceConfig";
import { loadLocalInstanceConnection } from "../../runtime/instanceConnection";
import {
    assertLocalInstanceName,
    assertLocalInstancePaths,
    resolveLocalInstancePaths,
    type UlviaPaths,
} from "../../runtime/paths";
import { showLocalLogs } from "../../runtime/stack/logs";
import type { InstallationConfig } from "../../runtime/stack/installation";
import { releaseInstanceDomain } from "../../runtime/stack/domains";
import { instancePublicUrl } from "../../runtime/stack/ports";
import {
    describeLocalKernel,
    destroyLocalKernel,
    listLocalInstanceNames,
    providerOperatorAccess,
    startLocalKernel,
    stopLocalKernel,
} from "../../runtime/stack/orchestration/instances";
import { requireRunningLocalProvider } from "../../runtime/stack/orchestration/services";
import { loadLocalServicesState } from "../../runtime/stack/orchestration/state";

export async function runExistingInstanceCommand(
    action: string,
    args: readonly string[],
    paths: UlviaPaths,
    installation: InstallationConfig,
    log: (message: string) => void,
): Promise<void> {
    const [name, ...rest] = args;
    if (!name) {
        throw new Error(`Usage: ulvia instance ${action} <name>`);
    }
    assertLocalInstanceName(name);
    const instancePaths = resolveLocalInstancePaths(paths, name);
    await assertLocalInstancePaths(instancePaths);
    if (action === "logs") {
        await showLocalLogs(rest, instancePaths, log, `ulvia instance logs ${name}`);
        return;
    }
    if (action === "delete") {
        if (rest.length !== 1 || rest[0] !== "--yes") {
            throw new Error(`Usage: ulvia instance delete ${name} --yes`);
        }
        await deleteInstance(paths, installation, name, log);
        return;
    }
    if (rest.length > 0) {
        throw new Error(`Usage: ulvia instance ${action} ${name}`);
    }
    await runLifecycleAction(action, paths, name, log);
}

export async function listInstances(
    paths: UlviaPaths,
    installation: InstallationConfig,
    log: (message: string) => void,
): Promise<void> {
    const names = await listLocalInstanceNames(paths);
    if (names.length === 0) {
        log("No local instances.");
        return;
    }
    const services = await loadLocalServicesState(paths);
    const activeInstallation = services?.installation ?? installation;
    for (const name of names) {
        const config = await loadLocalInstanceConfig(resolveLocalInstancePaths(paths, name).root);
        if (config) {
            log(`${name}\t${instancePublicUrl(config.hostname, activeInstallation)}`);
        }
    }
}

export async function assertProviderRunning(paths: UlviaPaths, installation: InstallationConfig) {
    return requireRunningLocalProvider(paths, installation);
}

async function runLifecycleAction(
    action: string,
    paths: UlviaPaths,
    name: string,
    log: (message: string) => void,
): Promise<void> {
    if (action === "start" || action === "upgrade") {
        await startLocalKernel(paths, name, log, action === "upgrade");
    } else if (action === "stop") {
        await stopLocalKernel(paths, name);
        log(`Instance ${name} stopped.`);
    } else if (action === "status") {
        await printInstanceStatus(paths, name, log);
    } else if (action === "credentials") {
        await printCredentials(paths, name, log);
    }
}

async function printInstanceStatus(paths: UlviaPaths, name: string, log: (message: string) => void): Promise<void> {
    const described = await describeLocalKernel(paths, name);
    const kernel = described.services.find(({ service }) => service === "kernel");
    const running = kernel?.state === "running" && (!kernel.health || kernel.health === "healthy");
    log(`Instance ${name}: ${running ? "running" : (kernel?.state ?? "stopped")}`);
    log(`Version: ${described.state?.version ?? "not started"}`);
    log(`URL: ${described.url}`);
}

async function printCredentials(paths: UlviaPaths, name: string, log: (message: string) => void): Promise<void> {
    const root = resolveLocalInstancePaths(paths, name).root;
    const config = await loadLocalInstanceConfig(root);
    if (!config || !(await loadLocalInstanceConnection(root))) {
        throw new Error(`Unknown local instance: ${name}`);
    }
    log(`Email: ${config.adminEmail}`);
    log(`Password: ${config.adminPassword}`);
    log(`Technical tokens remain in the private instance directory: ${root}`);
}

async function deleteInstance(
    paths: UlviaPaths,
    installation: InstallationConfig,
    name: string,
    log: (message: string) => void,
): Promise<void> {
    const instancePaths = resolveLocalInstancePaths(paths, name);
    const connection = await loadLocalInstanceConnection(instancePaths.root);
    if (!connection) {
        throw new Error(`Unknown local instance: ${name}`);
    }
    const services = await assertProviderRunning(paths, installation);
    await destroyLocalKernel(paths, name);
    const operator = await providerOperatorAccess(paths, services);
    await disableLocalInstance(operator.url, operator.token, connection.instanceId);
    const config = await loadLocalInstanceConfig(instancePaths.root);
    if (config) {
        await releaseInstanceDomain(paths, name, config.hostname);
    }
    await rm(instancePaths.root, { recursive: true, force: true });
    log(`Removed local Kernel ${name} and disabled its Provider instance. Provider data was retained.`);
}
