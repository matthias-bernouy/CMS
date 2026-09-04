import { LocalRepositoryCatalog } from "../repository/catalog";
import { randomBytes } from "node:crypto";
import type { LocalIntegrationRepository } from "../repository/local";
import { startLocalRepositoryServer } from "../repository/server";
import { startLocalCms, stopLocalCms, type DevPorts } from "../runtime/cms";
import { loadOrCreateDevRuntimeConfig } from "../runtime/config";
import { localMongoStatus, startLocalMongo, stopLocalMongo } from "../runtime/mongo";
import type { UlviaPaths } from "../runtime/paths";
import { localSupabaseStatus, startLocalSupabase, stopLocalSupabase } from "../runtime/supabase";
import { startLocalSupabaseManagementServer } from "../runtime/supabase-local";

const DEFAULT_PORTS: DevPorts = Object.freeze({
    control: 5100,
    delivery: 5101,
    repository: 5102,
    supabaseManagement: 5103,
    mongo: 27019,
});

export async function devCommand(
    args: readonly string[],
    paths: UlviaPaths,
    repository: LocalIntegrationRepository,
    log: (message: string) => void,
    environment: Record<string, string | undefined> = process.env,
): Promise<void> {
    const action = args[0] ?? "start";
    if (args.length > (args[0] ? 1 : 0)) {
        throw new Error("dev accepts only one action: status, credentials, or stop");
    }
    if (action === "start") {
        await runDev(paths, repository, log, resolveDevPorts(environment));
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
        return;
    }
    if (action === "stop") {
        const supabase = await stopLocalSupabase(paths.supabase);
        const mongo = await stopLocalMongo(paths.mongo);
        log(`Supabase: ${supabase ? "stopped" : "not running"}`);
        log(`MongoDB: ${mongo ? "stopped" : "not running"}`);
        return;
    }
    throw new Error(`Unknown dev action: ${action}`);
}

async function runDev(
    paths: UlviaPaths,
    repository: LocalIntegrationRepository,
    log: (message: string) => void,
    ports: DevPorts,
): Promise<void> {
    log("Starting persistent local Supabase services...");
    const supabaseEnvironment = await startLocalSupabase(paths.supabase);
    log("Starting persistent local MongoDB...");
    const mongo = await startLocalMongo(paths.mongo, ports.mongo);
    const bridge = startLocalRepositoryServer(repository, new LocalRepositoryCatalog(repository), ports.repository);
    const supabaseToken = randomBytes(32).toString("base64url");
    const supabaseManagement = await startLocalSupabaseManagementServer({
        projectRoot: paths.supabase,
        projectRef: "local",
        accessToken: supabaseToken,
        databaseUrl: supabaseEnvironment.databaseUrl,
        port: ports.supabaseManagement,
    });
    try {
        const config = await loadOrCreateDevRuntimeConfig(paths.dev);
        const cms = await startLocalCms(
            paths,
            config,
            mongo,
            bridge.url,
            {
                managementUrl: supabaseManagement.url,
                stripeApiUrl: supabaseManagement.stripeApiUrl,
                accessToken: supabaseToken,
                projectRef: "local",
                environment: supabaseEnvironment,
            },
            ports,
        );
        log("");
        log(`CMS Control: http://127.0.0.1:${ports.control}`);
        log(`CMS Delivery: http://127.0.0.1:${ports.delivery}`);
        log("Credentials: bun run ulvia -- dev credentials");
        log("The CMS repository is local-only; pull integrations in another terminal when needed.");
        log("Supabase-backed integration installs target the local database, Storage, and Edge Runtime.");
        await superviseCms(cms);
    } finally {
        bridge.stop();
        await supabaseManagement.stop();
    }
}

export function resolveDevPorts(environment: Record<string, string | undefined>): DevPorts {
    const ports: DevPorts = {
        control: readPort(environment, "ULVIA_DEV_CONTROL_PORT", DEFAULT_PORTS.control),
        delivery: readPort(environment, "ULVIA_DEV_DELIVERY_PORT", DEFAULT_PORTS.delivery),
        repository: readPort(environment, "ULVIA_DEV_REPOSITORY_PORT", DEFAULT_PORTS.repository),
        supabaseManagement: readPort(
            environment,
            "ULVIA_DEV_SUPABASE_MANAGEMENT_PORT",
            DEFAULT_PORTS.supabaseManagement,
        ),
        mongo: readPort(environment, "ULVIA_DEV_MONGO_PORT", DEFAULT_PORTS.mongo),
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
    const [supabase, mongo] = await Promise.all([localSupabaseStatus(paths.supabase), localMongoStatus(paths.mongo)]);
    log(`Supabase: ${supabase ? "running" : "not running"}`);
    if (supabase?.apiUrl) {
        log(`  API: ${supabase.apiUrl}`);
    }
    if (supabase?.studioUrl) {
        log(`  Studio: ${supabase.studioUrl}`);
    }
    log(`MongoDB: ${mongo ?? "not created"}`);
}
