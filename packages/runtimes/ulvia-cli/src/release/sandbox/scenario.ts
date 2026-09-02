import { randomBytes } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalRepositoryCatalog } from "../../repository/catalog";
import { LocalIntegrationRepository } from "../../repository/local";
import { startLocalRepositoryServer, type LocalRepositoryServer } from "../../repository/server";
import { startLocalCms, stopLocalCms, type CmsProcess } from "../../runtime/cms";
import { loadOrCreateDevRuntimeConfig } from "../../runtime/config";
import { destroyLocalMongo, startLocalMongo } from "../../runtime/mongo";
import { ensureUlviaPaths, resolveUlviaPaths } from "../../runtime/paths";
import { startLocalSupabaseManagementServer, type LocalSupabaseManagementServer } from "../../runtime/supabase-local";
import { startLocalSupabase, stopLocalSupabase } from "../../runtime/supabase";
import type { LocalReleasePackage } from "../types";
import { adoptRequiredLegacyBaselines } from "./adoption";
import { sandboxAnswers } from "./answers";
import { ReleaseSandboxClient } from "./client";
import { installRequiredDependencies } from "./dependencies";
import { removeReleaseSandbox } from "./filesystem";
import { allocateReleaseSandboxPorts } from "./ports";
import { prepareSandboxSupabase } from "./supabase-config";

export type ReleaseScenario = Readonly<{
    target: LocalReleasePackage;
    baseline?: LocalReleasePackage;
    packages: readonly LocalReleasePackage[];
}>;

export async function runReleaseScenario(scenario: ReleaseScenario): Promise<void> {
    const root = await mkdtemp(join(tmpdir(), "ulvia-release-"));
    const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: join(root, "data") }, root);
    const ports = await allocateReleaseSandboxPorts();
    let cms: CmsProcess | undefined;
    let repositoryServer: LocalRepositoryServer | undefined;
    let management: LocalSupabaseManagementServer | undefined;
    let supabasePrepared = false;
    let mongoRequested = false;
    let primaryError: unknown;
    try {
        await ensureUlviaPaths(paths);
        const projectRef = await prepareSandboxSupabase(paths.supabase, ports.supabase);
        supabasePrepared = true;
        const repository = new LocalIntegrationRepository(paths.repository, paths.packages);
        await repository.init();
        await storePackages(repository, scenario.packages);
        const supabase = await startLocalSupabase(paths.supabase);
        mongoRequested = true;
        const mongo = await startLocalMongo(paths.mongo, ports.cms.mongo, { ephemeral: true });
        repositoryServer = startLocalRepositoryServer(
            repository,
            new LocalRepositoryCatalog(repository),
            ports.cms.repository,
        );
        const accessToken = randomBytes(32).toString("base64url");
        management = await startLocalSupabaseManagementServer({
            projectRoot: paths.supabase,
            projectRef,
            accessToken,
            databaseUrl: supabase.databaseUrl,
            port: ports.cms.supabaseManagement,
        });
        const config = await loadOrCreateDevRuntimeConfig(paths.dev);
        cms = await startLocalCms(
            paths,
            config,
            mongo,
            repositoryServer.url,
            {
                managementUrl: management.url,
                stripeApiUrl: management.stripeApiUrl,
                accessToken,
                projectRef,
                environment: supabase,
            },
            ports.cms,
            { inheritOutput: process.env.ULVIA_DEBUG === "1" },
        );
        const client = new ReleaseSandboxClient(`http://127.0.0.1:${ports.cms.control}`, config);
        await client.login();
        const installed = new Map<string, string>();
        const initial = scenario.baseline ?? scenario.target;
        await installRequiredDependencies(initial, scenario.packages, installed, client);
        await client.install(
            initial.package.envelope.kind,
            initial.package.envelope.version,
            sandboxAnswers(initial.definition),
        );
        installed.set(initial.package.envelope.kind, initial.package.envelope.version);
        if (scenario.baseline) {
            await installRequiredDependencies(scenario.target, scenario.packages, installed, client);
            await adoptRequiredLegacyBaselines(scenario.baseline, scenario.target, client);
            await client.upgrade(scenario.target.package.envelope.kind, scenario.target.package.envelope.version);
        }
        await assertDatabaseReady(supabase.databaseUrl);
    } catch (error) {
        primaryError = error;
    } finally {
        const cleanup = await Promise.allSettled([
            cms ? stopLocalCms(cms) : Promise.resolve(),
            management ? management.stop() : Promise.resolve(),
        ]);
        repositoryServer?.stop();
        const infrastructure = await Promise.allSettled([
            mongoRequested ? destroyLocalMongo(paths.mongo) : Promise.resolve(false),
            supabasePrepared ? stopLocalSupabase(paths.supabase, { destroy: true }) : Promise.resolve(false),
        ]);
        const filesystem = await Promise.allSettled([removeReleaseSandbox(root)]);
        const cleanupError = [...cleanup, ...infrastructure, ...filesystem].find(
            (result): result is PromiseRejectedResult => result.status === "rejected",
        )?.reason;
        if (!primaryError && cleanupError) {
            primaryError = cleanupError;
        }
    }
    if (primaryError) {
        throw primaryError;
    }
}

async function storePackages(
    repository: LocalIntegrationRepository,
    packages: readonly LocalReleasePackage[],
): Promise<void> {
    const unique = new Map(packages.map((entry) => [coordinate(entry), entry]));
    for (const entry of unique.values()) {
        await repository.store({ package: entry.package, definition: entry.definition, source: "release-sandbox" });
    }
}

async function assertDatabaseReady(databaseUrl: string): Promise<void> {
    const { SQL } = await import("bun");
    const connection = new SQL(databaseUrl, { max: 1 });
    try {
        await connection`select 1 as ready`;
    } finally {
        await connection.close();
    }
}

function coordinate(entry: LocalReleasePackage): string {
    return `${entry.package.envelope.kind}@${entry.package.envelope.version}`;
}
