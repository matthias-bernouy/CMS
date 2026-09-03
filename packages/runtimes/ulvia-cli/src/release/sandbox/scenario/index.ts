import { randomBytes } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UpgradeFixtureScenarioV1 } from "@bernouy/cms-integration-verification/upgrade-fixtures/v1";
import type { IntegrationMigrationPhase } from "@bernouy/cms-integrations";
import { LocalRepositoryCatalog } from "../../../repository/catalog";
import { LocalIntegrationRepository } from "../../../repository/local";
import { startLocalRepositoryServer, type LocalRepositoryServer } from "../../../repository/server";
import { startLocalCms, stopLocalCms, type CmsProcess } from "../../../runtime/cms";
import { loadOrCreateDevRuntimeConfig } from "../../../runtime/config";
import { destroyLocalMongo, startLocalMongo } from "../../../runtime/mongo";
import { ensureUlviaPaths, resolveUlviaPaths } from "../../../runtime/paths";
import {
    startLocalSupabaseManagementServer,
    type LocalSupabaseManagementServer,
} from "../../../runtime/supabase-local";
import { startLocalSupabase, stopLocalSupabase } from "../../../runtime/supabase";
import type { LocalReleasePackage } from "../../types";
import { ReleaseSandboxClient } from "../client";
import { removeReleaseSandbox } from "../filesystem";
import { allocateReleaseSandboxPorts } from "../ports";
import { prepareSandboxSupabase } from "../supabase-config";
import { executeInstalledReleaseScenario } from "./fixture/execution";

export type ReleaseScenario = Readonly<{
    target: LocalReleasePackage;
    baseline?: LocalReleasePackage;
    packages: readonly LocalReleasePackage[];
    faultAfterPhase?: IntegrationMigrationPhase;
    fixture?: UpgradeFixtureScenarioV1;
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
        const supabaseCmsConfig = {
            managementUrl: management.url,
            stripeApiUrl: management.stripeApiUrl,
            accessToken,
            projectRef,
            environment: supabase,
        };
        const startCmsClient = async (faultAfterPhase?: IntegrationMigrationPhase) => {
            cms = await startLocalCms(paths, config, mongo, repositoryServer!.url, supabaseCmsConfig, ports.cms, {
                inheritOutput: process.env.ULVIA_DEBUG === "1",
                ...(faultAfterPhase ? { faultAfterMigrationPhase: faultAfterPhase } : {}),
            });
            const next = new ReleaseSandboxClient(`http://127.0.0.1:${ports.cms.control}`, config);
            await next.login();
            return next;
        };
        const client = await startCmsClient(scenario.faultAfterPhase);
        await executeInstalledReleaseScenario({
            scenario,
            supabase,
            client,
            restart: async () => {
                if (cms) {
                    await stopLocalCms(cms);
                    cms = undefined;
                }
                return await startCmsClient();
            },
        });
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
