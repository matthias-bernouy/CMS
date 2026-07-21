import { relative } from "node:path";
import { BunRunner } from "@bernouy/http-runner";
import { ControlCms } from "@bernouy/cms-control";
import { DeliveryCms } from "@bernouy/cms-delivery";
import { RepositoryCms } from "@bernouy/cms-repository";
import { LocalFsCmsFilesBlob } from "@bernouy/cms-files";
import { P9R_CACHE } from "@bernouy/cms-content";
import { scanDevBlocs } from "./dev-server/scan";
import { buildAllDevBlocs, type BuiltBloc } from "./dev-server/build";
import {
    createDevSources,
    GENERATED_BLOCS_DIR,
    seedDevSourceAccess,
    warnMissingGeneratedIntegrationArtifacts,
} from "./dev-server/integrations";
import { LocalFsDashboardRepository } from "./dev-server/dashboards";
import { LocalFsRelationRepository } from "./dev-server/relations";
import { LocalFsFunctionRepository } from "./dev-server/functions";
import { LocalFsTriggerRepository } from "./dev-server/triggers";
import { LocalFsIntegrationInstallationRepository } from "./dev-server/integrationInstallations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { HttpIntegrationDefinitionRepository } from "@bernouy/cms-integrations/http";
import { ConfiguredSupabaseConnectorDeployer } from "@bernouy/cms-integrations/supabase";
import type { IntegrationConnectorDeployer, IntegrationDefinitionRepository } from "@bernouy/cms-integrations";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { createReloadEmitter, createBlocRegistry, type ReloadEmitter } from "./dev-server/watch";
import { LocalFsCmsRepository } from "./dev-server/repo/LocalFsCmsRepository";
import { ValidatingCmsRepository } from "@bernouy/cms-content";
import { LocalFsCmsFiles, ValidatingCmsFilesMetadata } from "@bernouy/cms-files";
import { createDevAuth, DEV_PASSWORD } from "./dev-server/auth";
import { loadPushConfig } from "./push/shared/config";
import { LocalFsEnvSecretStore } from "./dev-server/secrets";
import { ValidatingSecretStore, createSecretResolver } from "@bernouy/cms-secrets";
import {
    ConfiguredEmailer,
    InMemoryAuthTokenStore,
    LocalAuthentication,
    SignedCookieCodec,
    SubjectResolver,
    TemplatedAuthEmailComposer,
} from "@bernouy/cms-auth";
import { InMemoryRolesRepository, type CMS_ROLES, ValidatingRolesRepository } from "@bernouy/cms-permissions";
import { SourceOverlaySourceRepository } from "@bernouy/cms-sources";
import { FunctionSourceRepository } from "@bernouy/cms-functions";
import { LocalFsSourceOverlayRepository } from "./dev-server/sourceOverlays";
import { LocalFsIntegrationConnectorProviderRepository } from "./dev-server/connectorProviders";
import { InMemoryIdentityService } from "@bernouy/cms-identities";
import { startDevSystemFunctionWorkers } from "./dev-server/systemFunctionWorkers";

export function parseDevFlags(args: string[]): {
    port: number;
    host: string;
    deliveryPort: number;
    publicHost: string;
    workers: boolean;
} {
    let port = 5000;
    let host = "localhost";
    let workers = false;
    for (const arg of args) {
        if (arg.startsWith("--port=")) {
            port = parsePortFlag(arg.slice("--port=".length));
        } else if (arg.startsWith("--host=")) {
            host = arg.slice("--host=".length) || host;
        } else if (arg === "--workers") {
            workers = true;
        }
    }
    const deliveryPort = port + 1;
    if (deliveryPort > 65535) {
        throw new Error("--port must be <= 65534 because Delivery uses port + 1");
    }
    const publicHost = host === "0.0.0.0" ? "localhost" : host;
    return { port, host, deliveryPort, publicHost, workers };
}

function sseHandler(reload: ReloadEmitter): (req: Request) => Response {
    return (req) => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            start(controller) {
                const send = (chunk: string) => {
                    try {
                        controller.enqueue(encoder.encode(chunk));
                    } catch {}
                };
                send(": connected\n\n");
                const unsub = reload.subscribe((tag) => send(`event: reload\ndata: ${tag}\n\n`));
                const ping = setInterval(() => send(": ping\n\n"), 25_000);
                const cleanup = () => {
                    clearInterval(ping);
                    unsub();
                    try {
                        controller.close();
                    } catch {}
                };
                req.signal.addEventListener("abort", cleanup, { once: true });
            },
        });
        return new Response(stream, {
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "Connection": "keep-alive" },
        });
    };
}

export type LocalRuntimeMode = "DEV" | "PROD";

export interface LocalRuntimeOptions {
    command: "dev" | "preview";
    mode: LocalRuntimeMode;
}

export const LOCAL_RUNTIME_PROFILES = {
    dev: { command: "dev", mode: "DEV" },
    preview: { command: "preview", mode: "PROD" },
} as const satisfies Record<LocalRuntimeOptions["command"], LocalRuntimeOptions>;

export async function runLocalCms(args: string[], options: LocalRuntimeOptions) {
    // Keep this assignment at the runtime boundary. MODE is observed lazily by
    // asset builders, caches, and security-header helpers while the local CMS
    // is being composed.
    process.env.MODE = options.mode;

    const cwd = process.cwd();
    const config = await loadPushConfig(cwd);
    let parsed: ReturnType<typeof parseDevFlags>;
    try {
        parsed = parseDevFlags(args);
    } catch (err) {
        console.error(`✖ ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    }
    const { port, host, deliveryPort, publicHost, workers } = parsed;

    console.log(`→ Site dir : ${config.siteDir}`);
    await warnMissingGeneratedIntegrationArtifacts(config.siteDir);

    // Initial scan + build of every local bloc. The same `built` map is then
    // passed to both the repo (BlocsStore reads from it) and the watcher
    // (mutates it on rebuild) — so live-reload propagates without any extra
    // wiring on our side.
    const authoredBlocs = await scanDevBlocs(`${config.siteDir}/blocs`, { quiet: true });
    const generatedBlocs = await scanDevBlocs(`${config.siteDir}/${GENERATED_BLOCS_DIR}`, { quiet: true });
    const blocs = [...authoredBlocs, ...generatedBlocs];
    if (blocs.length > 0) {
        console.log(`→ Found ${blocs.length} bloc(s):`);
        for (const b of blocs) {
            const rel = relative(cwd, b.folder) || ".";
            console.log(`    • ${b.tag.padEnd(28)} ${b.label}  —  ${rel}`);
        }
    }
    const built: Map<string, BuiltBloc> = blocs.length > 0 ? await buildAllDevBlocs(blocs) : new Map();
    if (blocs.length > 0) {
        console.log(`→ Built ${built.size}/${blocs.length} bloc(s).`);
    }

    const reload = createReloadEmitter();
    const repo = new ValidatingCmsRepository(new LocalFsCmsRepository(config.siteDir, built));
    const integrationBlocRepository = new ValidatingCmsRepository(
        new LocalFsCmsRepository(config.siteDir, built, { blocRootDir: GENERATED_BLOCS_DIR }),
    );
    const files = new LocalFsCmsFiles(`${config.siteDir}/files`);
    const recon = await files.reconcile();
    if (recon.healed.length) {
        console.log(`→ Reconciled ${recon.healed.length} moved file(s).`);
    }
    if (recon.minted.length) {
        console.log(`→ Minted ids for ${recon.minted.length} new file(s)/folder(s).`);
    }
    if (recon.deleted.length) {
        console.log(`→ Dropped ${recon.deleted.length} orphaned registry entry/entries.`);
    }
    for (const e of recon.errors) {
        console.warn(`  ! ${e.path}: ${e.error}`);
    }
    const filesMetadata = new ValidatingCmsFilesMetadata(files);
    const { auth, users, identityProviders, pats, credentials, devAdmin } = await createDevAuth();
    const sources = await createDevSources(config.siteDir);
    const sourceOverlays = new LocalFsSourceOverlayRepository(config.siteDir);
    const secrets = new ValidatingSecretStore(LocalFsEnvSecretStore.forSite(config.siteDir));
    const integrationConnectorProviders = new LocalFsIntegrationConnectorProviderRepository(config.siteDir);
    const integrationConnectorDeployers: IntegrationConnectorDeployer[] = [
        new ConfiguredSupabaseConnectorDeployer({
            integrationsRoot: OFFICIAL_INTEGRATIONS_ROOT,
            providerRepository: integrationConnectorProviders,
            secrets,
            functionSecrets: readSupabaseFunctionSecrets(process.env),
        }),
    ];
    const integrationRepositoryCatalog = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
    const integrationCatalog = createIntegrationCatalog(`http://${publicHost}:${port}/.cms/repository`);
    const integrationInstallations = new LocalFsIntegrationInstallationRepository(config.siteDir);
    const dashboards = new LocalFsDashboardRepository(config.siteDir);
    const relations = new LocalFsRelationRepository(config.siteDir);
    const functions = new LocalFsFunctionRepository(config.siteDir);
    const triggers = new LocalFsTriggerRepository(config.siteDir);
    const identities = new InMemoryIdentityService();
    const resolveSecret = createSecretResolver(secrets);
    const deliverySources = new SourceOverlaySourceRepository(sources, sourceOverlays, {
        deps: { resolveSecret, identities },
    });
    const roles = new ValidatingRolesRepository(new InMemoryRolesRepository());
    await seedDevSourceAccess(roles, sources);
    await seedDevSourceAccess(roles, new FunctionSourceRepository(functions));
    const publicAuth = {
        local: new LocalAuthentication<CMS_ROLES>({
            providerId: "local",
            loginPagePath: "/.cms/auth/login",
            logoutPath: "/.cms/auth/logout",
            credentials,
            resolver: new SubjectResolver<CMS_ROLES>(users, "user"),
            codec: new SignedCookieCodec(new TextEncoder().encode("p9r-dev-public-auth-session")),
            cookieName: "p9r-dev-site-session",
            defaultHome: "/",
            pats,
        }),
        credentials,
        users,
        tokens: new InMemoryAuthTokenStore(),
        emailer: new ConfiguredEmailer({
            readSettings: async () => (await repo.getSystem()).email,
            secrets,
        }),
        emailComposer: new TemplatedAuthEmailComposer({
            readTemplates: async () => (await repo.getSystem()).email.templates,
        }),
        defaultRole: "user" as CMS_ROLES,
        siteName: `p9r ${options.command}`,
        authEmailCooldownSeconds: 0,
        emailVerificationUrl: `http://${publicHost}:${deliveryPort}/auth/confirm-email`,
        passwordResetUrl: `http://${publicHost}:${deliveryPort}/auth/reset-password`,
    };

    const runner = new BunRunner();
    // Live-reload SSE channel — registered before the ControlCms group so it
    // matches first (the group catches `/` as a fallback).
    runner.addEndpoint("GET", "/dev/reload", sseHandler(reload));
    runner.group("/.cms/repository", (repositoryRunner) => {
        new RepositoryCms({ runner: repositoryRunner, integrationCatalog: integrationRepositoryCatalog });
    });

    const cms = new ControlCms(
        runner,
        repo,
        auth,
        {
            deliveryUrl: `http://${publicHost}:${deliveryPort}`,
            publicAuth: { ...publicAuth, allowSignup: false },
            integrationCatalog,
            integrationInstallations,
            integrationConnectorProviders,
            integrationConnectorDeployers,
            dashboards,
            relations,
            functions,
            triggers,
            identities,
            sourceOverlays,
            integrationBlocRepository,
        },
        undefined,
        secrets,
        filesMetadata,
        files,
        users,
        identityProviders,
        pats,
        credentials,
        sources,
        undefined,
        roles,
    );
    await cms.ready;

    // Watcher → cache invalidation. Bloc rebuild flips bytes in `built`; we
    // still need to drop the editor-script (consolidated bundle) and the
    // per-bloc cached response so the next fetch sees fresh JS.
    reload.subscribe((tag) => {
        cms.cache.delete(P9R_CACHE.EDITOR_SCRIPT);
        cms.cache.delete(P9R_CACHE.EDITOR_VIEW_SCRIPT);
        cms.cache.delete(P9R_CACHE.bloc(tag));
        cms.cache.deleteMatching((key) => key.startsWith(P9R_CACHE.BLOCSET_PREFIX));
        console.log(`[watch] Rebuilt ${tag} — caches invalidated, browser reload signaled.`);
    });
    const registry = createBlocRegistry(`${config.siteDir}/blocs`, authoredBlocs, built, reload);

    runner.start(port);

    // Public Delivery preview on a SECOND port — the actual rendered site
    // (pages, srcset image optimization, theme) that the editor authors. Shares
    // the same repo + files; variants land in a hidden `.cms-variants/` blob so
    // you can watch an <img> upgrade to a responsive `srcset` on refresh.
    // (In MODE=DEV the render cache bypasses, so a refresh re-renders and the
    // srcset appears once the background worker has generated — no PROD needed.)
    const deliveryRunner = new BunRunner();
    const variantStore = new LocalFsCmsFilesBlob(`${config.siteDir}/.cms-variants`);
    new DeliveryCms({
        runner: deliveryRunner,
        repository: repo,
        filesMetadata,
        filesBlob: files,
        variantStore,
        sources: deliverySources,
        functions,
        triggers,
        identities,
        integrationInstallations,
        sourceResolveSecret: resolveSecret,
        roles,
        auth: publicAuth,
    });
    deliveryRunner.start(deliveryPort);
    const systemFunctionWorkers = workers
        ? startDevSystemFunctionWorkers({
              functions,
              sources: deliverySources,
              deps: { resolveSecret, identities },
          })
        : undefined;

    console.log("");
    console.log(
        options.mode === "PROD"
            ? `✓ Production behavior preview ready on http://${host}:${port}`
            : `✓ Dev server ready on http://${host}:${port}`,
    );
    console.log(`  Runtime  : ${options.mode}`);
    console.log(`  Editor   : http://${host}:${port}/editor/page?id=/`);
    console.log(`  Admin    : http://${host}:${port}/admin/pages`);
    console.log(`  Public   : http://${host}:${deliveryPort}/  (rendered site + image optimization)`);
    console.log(`  Repo     : ${config.siteDir} (writes go straight to disk)`);
    console.log(`  Profile  : ${devAdmin.sub} / current password "${DEV_PASSWORD}" (Profile → Password)`);
    console.log(`  Watching : ${authoredBlocs.length} authored bloc folder(s) — edit + auto-reload`);
    console.log(`  Workers  : ${workers ? "enabled" : "disabled (pass --workers to run protected-commerce jobs)"}`);
    if (options.mode === "PROD") {
        console.log("  Warning  : local adapters and development authentication; not for public deployment");
    }
    console.log("");
    console.log("Press Ctrl+C to stop.");

    const shutdown = async (sig: string) => {
        console.log(`\n→ Stopping (${sig})...`);
        registry.stop();
        await systemFunctionWorkers?.stop();
        process.exit(0);
    };
    process.on("SIGINT", () => {
        void shutdown("SIGINT");
    });
    process.on("SIGTERM", () => {
        void shutdown("SIGTERM");
    });
}

export default async function CLI_dev(args: string[]) {
    return runLocalCms(args, LOCAL_RUNTIME_PROFILES.dev);
}

function createIntegrationCatalog(localRepositoryUrl: string): IntegrationDefinitionRepository {
    const repositoryUrl = process.env.P9R_INTEGRATION_REPOSITORY_URL?.trim();
    return new HttpIntegrationDefinitionRepository(repositoryUrl || localRepositoryUrl);
}

function readSupabaseFunctionSecrets(source: Record<string, string | undefined>): Record<string, string> {
    const keys = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM", "SMTP_REPLY_TO"];
    const secrets: Record<string, string> = {};
    for (const key of keys) {
        const value = source[key]?.trim();
        if (value) {
            secrets[key] = value;
        }
    }
    return secrets;
}

function parsePortFlag(raw: string): number {
    if (!/^\d+$/.test(raw)) {
        throw new Error("--port must be an integer");
    }
    const port = Number(raw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("--port must be between 1 and 65535");
    }
    return port;
}
