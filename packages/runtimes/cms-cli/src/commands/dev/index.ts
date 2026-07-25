import { DEV_PASSWORD } from "../../dev-server/runtime/auth";
import { warnMissingGeneratedIntegrationArtifacts } from "../../dev-server/integrations";
import { createReloadEmitter } from "../../dev-server/watch/index";
import { loadPushConfig } from "../../push/shared/config";
import { prepareLocalBlocs } from "./blocs";
import { LOCAL_RUNTIME_PROFILES, type LocalRuntimeOptions, parseDevFlags } from "./flags";
import { createLocalServices } from "./services";
import { startLocalServers } from "./servers";

export async function runLocalCms(args: string[], runtime: LocalRuntimeOptions) {
    process.env.MODE = runtime.mode;
    const cwd = process.cwd();
    const config = await loadPushConfig(cwd);
    const flags = parseFlagsOrExit(args);

    console.log(`→ Site dir : ${config.siteDir}`);
    await warnMissingGeneratedIntegrationArtifacts(config.siteDir);

    const blocs = await prepareLocalBlocs(config.siteDir, cwd);
    const reload = createReloadEmitter();
    const services = await createLocalServices({
        siteDir: config.siteDir,
        built: blocs.built,
        publicHost: flags.publicHost,
        port: flags.port,
        deliveryPort: flags.deliveryPort,
        command: runtime.command,
    });
    const servers = await startLocalServers({
        siteDir: config.siteDir,
        flags,
        runtime,
        blocs,
        reload,
        services,
    });

    logReady(runtime, flags, config.siteDir, blocs.authored.length, services.devAdmin.sub);
    let stopping = false;
    const shutdown = async (signal: string) => {
        if (stopping) {
            return;
        }
        stopping = true;
        console.log(`\n→ Stopping (${signal})...`);
        servers.registry.stop();
        await servers.stop();
        process.exit(0);
    };
    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

export default async function CLI_dev(args: string[]) {
    return runLocalCms(args, LOCAL_RUNTIME_PROFILES.dev);
}

function parseFlagsOrExit(args: string[]) {
    try {
        return parseDevFlags(args);
    } catch (error) {
        console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}

function logReady(
    runtime: LocalRuntimeOptions,
    flags: ReturnType<typeof parseDevFlags>,
    siteDir: string,
    blocCount: number,
    adminSubject: string,
): void {
    console.log("");
    console.log(
        runtime.mode === "PROD"
            ? `✓ Production behavior preview ready on http://${flags.host}:${flags.port}`
            : `✓ Dev server ready on http://${flags.host}:${flags.port}`,
    );
    console.log(`  Runtime  : ${runtime.mode}`);
    console.log(`  Editor   : http://${flags.host}:${flags.port}/editor/page?id=/`);
    console.log(`  Admin    : http://${flags.host}:${flags.port}/admin/pages`);
    console.log(`  Public   : http://${flags.host}:${flags.deliveryPort}/  (rendered site + image optimization)`);
    console.log(`  Repo     : ${siteDir} (writes go straight to disk)`);
    console.log(`  Profile  : ${adminSubject} / current password "${DEV_PASSWORD}" (Profile → Password)`);
    console.log(`  Watching : ${blocCount} authored bloc folder(s) — edit + auto-reload`);
    console.log(`  Workers  : ${flags.workers ? "enabled" : "paused for this runtime (--no-workers)"}`);
    console.log(
        `  Images   : ${flags.sourceImages ? "responsive Source variants enabled" : "disabled (--no-source-images)"}`,
    );
    if (runtime.mode === "PROD") {
        console.log("  Warning  : local adapters and development authentication; not for public deployment");
    }
    console.log("\nPress Ctrl+C to stop.");
}
