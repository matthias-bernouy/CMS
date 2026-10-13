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
import { resolveDevPorts } from "../runtime/devPorts";
import { provisionLocalInstance } from "../runtime/instance";
import { localMongoStatus, startLocalMongo, stopLocalMongo } from "../runtime/mongo";
import type { UlviaPaths } from "../runtime/paths";
import { bootstrapOfficialRepository } from "./bootstrap";
import { resetCurrentDevEnvironment, runFreshDevEnvironment } from "./devData";

export async function devCommand(
    args: readonly string[],
    paths: UlviaPaths,
    log: (message: string) => void,
    environment: Record<string, string | undefined> = process.env,
): Promise<void> {
    const action = args[0] ?? "start";
    if (action === "start") {
        expectArgumentCount(args, 0, "Usage: ulvia dev");
        await runDev(paths, log, resolveDevPorts(environment));
        return;
    }
    if (action === "status") {
        expectArgumentCount(args, 1, "Usage: ulvia dev status");
        await devStatus(paths, log);
        return;
    }
    if (action === "credentials") {
        expectArgumentCount(args, 1, "Usage: ulvia dev credentials");
        const config = await loadOrCreateDevRuntimeConfig(paths.dev);
        log(`Email: ${config.adminEmail}`);
        log(`Password: ${config.adminPassword}`);
        log(`Technical tokens remain in the private runtime directory: ${paths.dev}`);
        return;
    }
    if (action === "stop") {
        expectArgumentCount(args, 1, "Usage: ulvia dev stop");
        const mongo = await stopLocalMongo(paths.mongo);
        log(`MongoDB: ${mongo ? "stopped" : "not running"}`);
        return;
    }
    if (action === "new") {
        expectArgumentCount(args, 2, "Usage: ulvia dev new <absolute-data-directory>");
        const ports = resolveDevPorts(environment);
        await runFreshDevEnvironment(args[1] ?? "", paths, ports, log, async (freshPaths, freshPorts) => {
            await runDev(freshPaths, log, freshPorts);
        });
        return;
    }
    if (action === "reset") {
        if (args.length !== 2 || args[1] !== "--yes") {
            throw new Error(
                "Usage: ulvia dev reset --yes (permanently deletes the current dev instance and repository)",
            );
        }
        await resetCurrentDevEnvironment(paths, resolveDevPorts(environment), log);
        return;
    }
    throw new Error(`Unknown dev action: ${action}`);
}

function expectArgumentCount(args: readonly string[], expected: number, usage: string): void {
    if (args.length !== expected) {
        throw new Error(usage);
    }
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
    log(`Persistent data: ${paths.data}`);
    log("Credentials: run ulvia dev credentials with the same ULVIA_DATA_DIR");
    try {
        await superviseServers(kernel, provider);
    } finally {
        repository.stop();
    }
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
