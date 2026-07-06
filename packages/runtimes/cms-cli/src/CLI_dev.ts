// `p9r dev` is the local development entry point. Flag the runtime so the
// socle's security headers (CSP, COOP) downgrade to Report-Only and the
// asset cache is bypassed — both already gated on `MODE === "DEV"`. Set
// before the lazy-evaluated helpers in `@bernouy/cms-bloc-compile/server/compression`
// observe it (they read at call time, not at import time).
process.env.MODE = "DEV";

import { relative } from "node:path";
import { BunRunner } from "@bernouy/http-runner";
import { ControlCms } from "@bernouy/cms-control";
import { DeliveryCms } from "@bernouy/cms-delivery";
import { LocalFsCmsFilesBlob } from "@bernouy/cms-files";
import { P9R_CACHE } from "@bernouy/cms-content";
import { scanDevBlocs } from "./dev-server/scan";
import { buildAllDevBlocs, type BuiltBloc } from "./dev-server/build";
import { createDevSources, GENERATED_BLOCS_DIR } from "./dev-server/integrations";
import { LocalFsDashboardRepository } from "./dev-server/dashboards";
import { LocalFsIntegrationInstanceRepository } from "./dev-server/integrationInstances";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { HttpIntegrationDefinitionRepository } from "@bernouy/cms-integrations/http";
import { SupabaseConnectorDeployer } from "@bernouy/cms-integrations/supabase";
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

export function parseDevFlags(args: string[]): { port: number; host: string; deliveryPort: number; publicHost: string } {
    let port = 5000;
    let host = "localhost";
    for (const arg of args) {
        if      (arg.startsWith("--port=")) port = parsePortFlag(arg.slice("--port=".length));
        else if (arg.startsWith("--host=")) host = arg.slice("--host=".length) || host;
    }
    const deliveryPort = port + 1;
    if (deliveryPort > 65535) throw new Error("--port must be <= 65534 because Delivery uses port + 1");
    const publicHost = host === "0.0.0.0" ? "localhost" : host;
    return { port, host, deliveryPort, publicHost };
}

function sseHandler(reload: ReloadEmitter): (req: Request) => Response {
    return (req) => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            start(controller) {
                const send = (chunk: string) => { try { controller.enqueue(encoder.encode(chunk)); } catch {} };
                send(": connected\n\n");
                const unsub = reload.subscribe(tag => send(`event: reload\ndata: ${tag}\n\n`));
                const ping  = setInterval(() => send(": ping\n\n"), 25_000);
                const cleanup = () => { clearInterval(ping); unsub(); try { controller.close(); } catch {} };
                req.signal.addEventListener("abort", cleanup, { once: true });
            },
        });
        return new Response(stream, {
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "Connection": "keep-alive" },
        });
    };
}

export default async function CLI_dev(args: string[]) {
    const cwd = process.cwd();
    const config = await loadPushConfig(cwd);
    let parsed: ReturnType<typeof parseDevFlags>;
    try {
        parsed = parseDevFlags(args);
    } catch (err) {
        console.error(`✖ ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    }
    const { port, host, deliveryPort, publicHost } = parsed;

    console.log(`→ Site dir : ${config.siteDir}`);

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
    if (blocs.length > 0) console.log(`→ Built ${built.size}/${blocs.length} bloc(s).`);

    const reload = createReloadEmitter();
    const repo   = new ValidatingCmsRepository(new LocalFsCmsRepository(config.siteDir, built));
    const integrationBlocRepository = new ValidatingCmsRepository(
        new LocalFsCmsRepository(config.siteDir, built, { blocRootDir: GENERATED_BLOCS_DIR }),
    );
    const files = new LocalFsCmsFiles(`${config.siteDir}/files`);
    const recon = await files.reconcile();
    if (recon.healed.length)  console.log(`→ Reconciled ${recon.healed.length} moved file(s).`);
    if (recon.minted.length)  console.log(`→ Minted ids for ${recon.minted.length} new file(s)/folder(s).`);
    if (recon.deleted.length) console.log(`→ Dropped ${recon.deleted.length} orphaned registry entry/entries.`);
    for (const e of recon.errors) console.warn(`  ! ${e.path}: ${e.error}`);
    const filesMetadata = new ValidatingCmsFilesMetadata(files);
    const { auth, users, identityProviders, pats, credentials, devAdmin } = await createDevAuth();
    const sources = await createDevSources(config.siteDir);
    const integrationCatalog = createIntegrationCatalog();
    const integrationConnectorDeployers = createIntegrationConnectorDeployers();
    const integrationInstances = new LocalFsIntegrationInstanceRepository(config.siteDir);
    const dashboards = new LocalFsDashboardRepository(config.siteDir);
    const secrets = new ValidatingSecretStore(LocalFsEnvSecretStore.forSite(config.siteDir));
    const resolveSecret = createSecretResolver(secrets);
    const roles = new ValidatingRolesRepository(new InMemoryRolesRepository());
    const publicAuth = {
        local: new LocalAuthentication<CMS_ROLES>({
            providerId:    "local",
            loginPagePath: "/.cms/auth/login",
            logoutPath:    "/.cms/auth/logout",
            credentials,
            resolver:      new SubjectResolver<CMS_ROLES>(users, "user"),
            codec:         new SignedCookieCodec(new TextEncoder().encode("p9r-dev-public-auth-session")),
            cookieName:    "p9r-dev-site-session",
            defaultHome:   "/",
            pats,
        }),
        credentials,
        users,
        tokens:                   new InMemoryAuthTokenStore(),
        emailer:                  new ConfiguredEmailer({
            readSettings: async () => (await repo.getSystem()).email,
            secrets,
        }),
        emailComposer:            new TemplatedAuthEmailComposer({
            readTemplates: async () => (await repo.getSystem()).email.templates,
        }),
        defaultRole:              "user" as CMS_ROLES,
        siteName:                 "p9r dev",
        authEmailCooldownSeconds: 0,
        emailVerificationUrl:     `http://${publicHost}:${deliveryPort}/auth/confirm-email`,
        passwordResetUrl:         `http://${publicHost}:${deliveryPort}/auth/reset-password`,
    };

    const runner = new BunRunner();
    // Live-reload SSE channel — registered before the ControlCms group so it
    // matches first (the group catches `/` as a fallback).
    runner.addEndpoint("GET", "/dev/reload", sseHandler(reload));

    const cms = new ControlCms(runner, repo, auth, {
        deliveryUrl: `http://${publicHost}:${deliveryPort}`,
        publicAuth: { ...publicAuth, allowSignup: false },
        integrationCatalog,
        integrationInstances,
        integrationConnectorDeployers,
        dashboards,
        integrationBlocRepository,
    }, undefined, secrets, filesMetadata, files, users, identityProviders, pats, credentials, sources, undefined, roles);
    await cms.ready;

    // Watcher → cache invalidation. Bloc rebuild flips bytes in `built`; we
    // still need to drop the editor-script (consolidated bundle) and the
    // per-bloc cached response so the next fetch sees fresh JS.
    reload.subscribe(tag => {
        cms.cache.delete(P9R_CACHE.EDITOR_SCRIPT);
        cms.cache.delete(P9R_CACHE.EDITOR_VIEW_SCRIPT);
        cms.cache.delete(P9R_CACHE.bloc(tag));
        cms.cache.deleteMatching(key => key.startsWith(P9R_CACHE.BLOCSET_PREFIX));
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
        sources,
        integrationInstances,
        sourceResolveSecret: resolveSecret,
        roles,
        auth: publicAuth,
    });
    deliveryRunner.start(deliveryPort);

    console.log("");
    console.log(`✓ Dev server ready on http://${host}:${port}`);
    console.log(`  Editor   : http://${host}:${port}/editor/page?id=/`);
    console.log(`  Admin    : http://${host}:${port}/admin/pages`);
    console.log(`  Public   : http://${host}:${deliveryPort}/  (rendered site + image optimization)`);
    console.log(`  Repo     : ${config.siteDir} (writes go straight to disk)`);
    console.log(`  Profile  : ${devAdmin.sub} / current password "${DEV_PASSWORD}" (Profile → Password)`);
    console.log(`  Watching : ${authoredBlocs.length} authored bloc folder(s) — edit + auto-reload`);
    console.log("");
    console.log("Press Ctrl+C to stop.");

    const shutdown = (sig: string) => {
        console.log(`\n→ Stopping (${sig})...`);
        registry.stop();
        process.exit(0);
    };
    process.on("SIGINT",  () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
}

function createIntegrationCatalog(): IntegrationDefinitionRepository {
    const repositoryUrl = process.env.P9R_INTEGRATION_REPOSITORY_URL?.trim();
    if (repositoryUrl) return new HttpIntegrationDefinitionRepository(repositoryUrl);
    return new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
}

function createIntegrationConnectorDeployers(): IntegrationConnectorDeployer[] | undefined {
    const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim() || process.env.SUPABASE_TOKEN_CONNECTION?.trim();
    const projectRef = process.env.SUPABASE_PROJECT_REF?.trim() || process.env.SUPABASE_PROJECT_ID?.trim();
    if (!accessToken && !projectRef) return undefined;
    if (!accessToken || !projectRef) {
        throw new Error("Supabase connector deployment requires SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF");
    }
    return [new SupabaseConnectorDeployer({
        integrationsRoot: OFFICIAL_INTEGRATIONS_ROOT,
        accessToken,
        projectRef,
    })];
}

function parsePortFlag(raw: string): number {
    if (!/^\d+$/.test(raw)) throw new Error("--port must be an integer");
    const port = Number(raw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("--port must be between 1 and 65535");
    }
    return port;
}
