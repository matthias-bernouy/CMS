import { startLocalRepository } from "../runtime/repository";
import { loadOrCreateDevRuntimeConfig, loadOrCreateRepositoryToken } from "../runtime/config";
import { startLocalCms, stopLocalCms, type DevPorts } from "../runtime/cms";
import { localMongoStatus, startLocalMongo, stopLocalMongo } from "../runtime/mongo";
import { loadOrCreateProviderToken, startLocalProvider, stopLocalProvider } from "../runtime/provider";
import type { UlviaPaths } from "../runtime/paths";
import { bootstrapOfficialRepository } from "./bootstrap";

const DEFAULT_PORTS: DevPorts = Object.freeze({
    control: 5100,
    delivery: 5101,
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
        log(`Provider token: ${await loadOrCreateProviderToken(paths.dev)}`);
        log(`Repository token: ${await loadOrCreateRepositoryToken(paths.dev)}`);
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
    const provider = await startLocalProvider(paths, ports).catch((error) => {
        repository.stop();
        throw error;
    });
    let cms: Awaited<ReturnType<typeof startLocalCms>>;
    try {
        cms = await startLocalCms(paths, config, mongo, ports, {
            localProviderToken: provider.coreCallToken,
            localProviderEndpoint: provider.url,
            localProviderAccessToken: provider.token,
        });
    } catch (error) {
        await stopLocalProvider(provider.process);
        repository.stop();
        throw error;
    }
    log("");
    log(`Resource repository: ${repository.url}`);
    log(`Official provider: ${provider.url}`);
    log(`CMS Control: http://127.0.0.1:${ports.control}`);
    log(`CMS Delivery: http://127.0.0.1:${ports.delivery}`);
    log("Credentials: bun run ulvia -- dev credentials");
    try {
        await superviseCms(cms);
    } finally {
        await stopLocalProvider(provider.process);
        repository.stop();
    }
}

export function resolveDevPorts(environment: Record<string, string | undefined>): DevPorts {
    const ports: DevPorts = {
        control: readPort(environment, "ULVIA_DEV_CONTROL_PORT", DEFAULT_PORTS.control),
        delivery: readPort(environment, "ULVIA_DEV_DELIVERY_PORT", DEFAULT_PORTS.delivery),
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

async function superviseCms(cms: Awaited<ReturnType<typeof startLocalCms>>): Promise<void> {
    let stopping: Promise<void> | undefined;
    const stop = () => {
        stopping ??= stopLocalCms(cms);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    try {
        const exitCode = await cms.exited;
        await stopping;
        if (exitCode !== 0 && !stopping) {
            throw new Error(`Local CMS exited with code ${exitCode}`);
        }
    } finally {
        process.off("SIGINT", stop);
        process.off("SIGTERM", stop);
        await stopLocalCms(cms);
    }
}

async function devStatus(paths: UlviaPaths, log: (message: string) => void): Promise<void> {
    log(`MongoDB: ${(await localMongoStatus(paths.mongo)) ?? "not created"}`);
}
