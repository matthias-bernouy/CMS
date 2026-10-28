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
import { showInstanceLogs } from "../../runtime/stack/logs";
import { OperatorObservabilityClient } from "../../runtime/stack/logs/OperatorObservabilityClient";
import type { InstallationConfig } from "../../runtime/stack/installation";
import { releaseInstanceDomain } from "../../runtime/stack/domains";
import { instancePublicUrl } from "../../runtime/stack/ports";
import {
    describeLocalEdge,
    destroyLocalEdge,
    listLocalInstanceNames,
    providerOperatorAccess,
    startLocalEdge,
    stopLocalEdge,
} from "../../runtime/stack/orchestration/instances";
import { requireRunningLocalProvider } from "../../runtime/stack/orchestration/services";
import { loadLocalServicesState } from "../../runtime/stack/orchestration/state";

export async function runExistingInstanceCommand(
    action: string,
    args: readonly string[],
    paths: UlviaPaths,
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
        const connection = await loadLocalInstanceConnection(instancePaths.root);
        const state = await loadLocalServicesState(paths);
        if (!connection || !state) {
            throw new Error("Local instance and services must be initialized");
        }
        const client = new OperatorObservabilityClient(
            `http://127.0.0.1:${state.installation.ports.provider}`,
            connection.token,
            connection.instanceId,
        );
        await showInstanceLogs(rest, client, log);
        return;
    }
    if (action === "delete") {
        if (rest.length !== 1 || rest[0] !== "--yes") {
            throw new Error(`Usage: ulvia instance delete ${name} --yes`);
        }
        await deleteInstance(paths, name, log);
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

export async function assertProviderRunning(paths: UlviaPaths) {
    return requireRunningLocalProvider(paths);
}

async function runLifecycleAction(
    action: string,
    paths: UlviaPaths,
    name: string,
    log: (message: string) => void,
): Promise<void> {
    if (action === "start") {
        await startLocalEdge(paths, name, log);
    } else if (action === "stop") {
        await stopLocalEdge(paths, name);
        log(`Instance ${name} stopped.`);
    } else if (action === "status") {
        await printInstanceStatus(paths, name, log);
    } else if (action === "credentials") {
        await printCredentials(paths, name, log);
    }
}

async function printInstanceStatus(paths: UlviaPaths, name: string, log: (message: string) => void): Promise<void> {
    const described = await describeLocalEdge(paths, name);
    const edge = described.services.find(({ service }) => service === "edge");
    const running = edge?.state === "running" && (!edge.health || edge.health === "healthy");
    log(`Instance ${name}: ${running ? "running" : (edge?.state ?? "stopped")}`);
    log(`Version: ${described.state?.image.version ?? "not started"}`);
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

async function deleteInstance(paths: UlviaPaths, name: string, log: (message: string) => void): Promise<void> {
    const instancePaths = resolveLocalInstancePaths(paths, name);
    const connection = await loadLocalInstanceConnection(instancePaths.root);
    if (!connection) {
        throw new Error(`Unknown local instance: ${name}`);
    }
    const services = await assertProviderRunning(paths);
    await destroyLocalEdge(paths, name);
    const operator = await providerOperatorAccess(paths, services);
    await disableLocalInstance(operator.url, operator.token, connection.instanceId);
    const config = await loadLocalInstanceConfig(instancePaths.root);
    if (config) {
        await releaseInstanceDomain(paths, name, config.hostname);
    }
    await rm(instancePaths.root, { recursive: true, force: true });
    log(`Removed local Edge ${name} and disabled its Provider instance. Provider data was retained.`);
}
