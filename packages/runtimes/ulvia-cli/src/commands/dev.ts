import { startLocalRepository } from "../runtime/repository";
import {
    loadOrCreateDevRuntimeConfig,
    loadOrCreateProviderOperatorToken,
    loadOrCreateRepositoryToken,
    saveLocalInstanceConnection,
} from "../runtime/config";
import {
    startLocalKernel,
    startLocalProvider,
    stopLocalServer,
    type CmsServerProcess,
    type DevPorts,
} from "../runtime/cms";
import { provisionLocalInstance } from "../runtime/instance";
import { localMongoStatus, startLocalMongo, stopLocalMongo } from "../runtime/mongo";
import type { UlviaPaths } from "../runtime/paths";
import { bootstrapOfficialRepository } from "./bootstrap";

const DEFAULT_PORTS: DevPorts = Object.freeze({
    kernel: 5100,
    mongo: 27019,
    repository: 5102,
    provider: 5103,
});

export async function devCommand(
    args: readonly string[],
    paths: UlviaPaths,
    log: (message: string) => void,
    environment: Record<string, string | undefined> = process.env,
): Promise<void> {
    const action = args[0] ?? "start";
    if (args.length > (args[0] ? 1 : 0)) {
        throw new Error("dev accepts only one action: status, credentials, or stop");
    }
    if (action === "start") {
        await runDev(paths, log, resolveDevPorts(environment));
        return;
    }
    if (action === "status") {
        await devStatus(paths, log);
        return;
    }
    if (action === "credentials") {
        const config = await loadOrCreateDevRuntimeConfig(paths.dev);
        log(`Email: ${config.adminEmail}`);
        log(`Password: ${config.adminPassword}`);
        log(`Technical tokens remain in the private runtime directory: ${paths.dev}`);
        return;
    }
    if (action === "stop") {
        const mongo = await stopLocalMongo(paths.mongo);
        log(`MongoDB: ${mongo ? "stopped" : "not running"}`);
        return;
    }
    throw new Error(`Unknown dev action: ${action}`);
}

async function runDev(paths: UlviaPaths, log: (message: string) => void, ports: DevPorts): Promise<void> {
    log("Preparing bundled official resources...");
    await bootstrapOfficialRepository(paths.repository);
    log("Starting persistent local MongoDB...");
    const mongo = await startLocalMongo(paths.mongo, ports.mongo);
    const config = await loadOrCreateDevRuntimeConfig(paths.dev);
    const repository = startLocalRepository(
        ports.repository,
        paths.repository,
        await loadOrCreateRepositoryToken(paths.dev),
    );
    const operatorToken = await loadOrCreateProviderOperatorToken(paths.dev);
    let provider: CmsServerProcess;
    try {
        provider = await startLocalProvider(paths, config, mongo, ports, { operatorToken });
    } catch (error) {
        repository.stop();
        throw error;
    }
    let kernel: CmsServerProcess;
    try {
        log("Provisioning the local CMS instance...");
        const provisioned = await provisionLocalInstance(
            `http://127.0.0.1:${ports.provider}`,
            operatorToken,
            config,
            `http://127.0.0.1:${ports.kernel}`,
        );
        const instance = await saveLocalInstanceConnection(paths.dev, provisioned);
        kernel = await startLocalKernel(paths, mongo, ports, instance);
    } catch (error) {
        await stopLocalServer(provider);
        repository.stop();
        throw error;
    }
    log("");
    log(`Resource repository: ${repository.url}`);
    log(`Ulvia Provider: http://127.0.0.1:${ports.provider}`);
    log(`CMS Kernel: http://127.0.0.1:${ports.kernel}`);
    log("Credentials: bun run ulvia -- dev credentials");
    try {
        await superviseServers(kernel, provider);
    } finally {
        repository.stop();
    }
}

export function resolveDevPorts(environment: Record<string, string | undefined>): DevPorts {
    const configuredProviderPort = environment.ULVIA_DEV_PROVIDER_PORT?.trim();
    if (configuredProviderPort && configuredProviderPort !== String(DEFAULT_PORTS.provider)) {
        throw new Error(
            `ULVIA_DEV_PROVIDER_PORT cannot override the official Provider origin; expected ${DEFAULT_PORTS.provider}`,
        );
    }
    const ports: DevPorts = {
        kernel: readPort(environment, "ULVIA_DEV_KERNEL_PORT", DEFAULT_PORTS.kernel),
        mongo: readPort(environment, "ULVIA_DEV_MONGO_PORT", DEFAULT_PORTS.mongo),
        repository: readPort(environment, "ULVIA_DEV_REPOSITORY_PORT", DEFAULT_PORTS.repository),
        provider: DEFAULT_PORTS.provider,
    };
    if (new Set(Object.values(ports)).size !== Object.values(ports).length) {
        throw new Error("Ulvia dev ports must be distinct");
    }
    return ports;
}

function readPort(environment: Record<string, string | undefined>, name: string, fallback: number): number {
    const raw = environment[name]?.trim();
    if (!raw) {
        return fallback;
    }
    const port = Number(raw);
    if (!/^\d+$/u.test(raw) || !Number.isInteger(port) || port < 1 || port > 65_535) {
        throw new Error(`${name} must be an integer between 1 and 65535`);
    }
    return port;
}

async function superviseServers(kernel: CmsServerProcess, provider: CmsServerProcess): Promise<void> {
    let stopping: Promise<void> | undefined;
    const stop = () => {
        stopping ??= stopServers(kernel, provider);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    try {
        const [name, exitCode] = await Promise.race([
            kernel.exited.then((code) => ["CMS Kernel", code] as const),
            provider.exited.then((code) => ["Ulvia Provider", code] as const),
        ]);
        await stopping;
        if (exitCode !== 0 && !stopping) {
            throw new Error(`${name} exited with code ${exitCode}`);
        }
    } finally {
        process.off("SIGINT", stop);
        process.off("SIGTERM", stop);
        await stopServers(kernel, provider);
    }
}

async function stopServers(kernel: CmsServerProcess, provider: CmsServerProcess): Promise<void> {
    await stopLocalServer(kernel);
    await stopLocalServer(provider);
}

async function devStatus(paths: UlviaPaths, log: (message: string) => void): Promise<void> {
    log(`MongoDB: ${(await localMongoStatus(paths.mongo)) ?? "not created"}`);
}
