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

const PORTS: DevPorts = Object.freeze({
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
): Promise<void> {
    const action = args[0] ?? "start";
    if (args.length > (args[0] ? 1 : 0)) {
        throw new Error("dev accepts only one action: status, credentials, or stop");
    }
    if (action === "start") {
        await runDev(paths, repository, log);
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
): Promise<void> {
    log("Starting persistent local Supabase services...");
    const supabaseEnvironment = await startLocalSupabase(paths.supabase);
    log("Starting persistent local MongoDB...");
    const mongo = await startLocalMongo(paths.mongo, PORTS.mongo);
    const bridge = startLocalRepositoryServer(repository, new LocalRepositoryCatalog(repository), PORTS.repository);
    const supabaseToken = randomBytes(32).toString("base64url");
    const supabaseManagement = await startLocalSupabaseManagementServer({
        projectRoot: paths.supabase,
        projectRef: "local",
        accessToken: supabaseToken,
        databaseUrl: supabaseEnvironment.databaseUrl,
        port: PORTS.supabaseManagement,
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
            PORTS,
        );
        log("");
        log(`CMS Control: http://127.0.0.1:${PORTS.control}`);
        log(`CMS Delivery: http://127.0.0.1:${PORTS.delivery}`);
        log("Credentials: bun run ulvia -- dev credentials");
        log("The CMS repository is local-only; pull integrations in another terminal when needed.");
        log("Supabase-backed integration installs target the local database, Storage, and Edge Runtime.");
        await superviseCms(cms);
    } finally {
        bridge.stop();
        await supabaseManagement.stop();
    }
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
