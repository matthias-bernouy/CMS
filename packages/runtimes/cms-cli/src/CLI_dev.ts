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
import { InMemoryAuthentication } from "@bernouy/cms-control";
import { scanDevBlocs } from "./dev-server/scan";
import { buildAllDevBlocs, type BuiltBloc } from "./dev-server/build";
import { loadDevGateways } from "./dev-server/gateways";
import { createReloadEmitter, createBlocRegistry, type ReloadEmitter } from "./dev-server/watch";
import { LocalFsCmsRepository } from "./dev-server/repo/LocalFsCmsRepository";
import { ValidatingCmsRepository } from "@bernouy/cms-content";
import { LocalFsCmsFiles, ValidatingCmsFilesMetadata } from "@bernouy/cms-files";
import { InMemoryUsersRepository } from "@bernouy/cms-auth";
import { InMemoryIdentityProviderRepository } from "@bernouy/cms-auth";
import { InMemoryLocalCredentialStore } from "@bernouy/cms-auth";
import { InMemoryPatRepository } from "@bernouy/cms-auth";
import { InMemoryGatewayRepository, ValidatingGatewayRepository, seedProviders } from "@bernouy/cms-gateway";
import type { CMS_ROLES } from "@bernouy/cms-permissions";
import { loadPushConfig } from "./push/shared/config";

/** Seeded password for the dev `dev-admin` local credential — only used to
 *  exercise the Profile → Password "current password" re-auth in dev. */
const DEV_PASSWORD = "password";

function parseFlags(args: string[]): { port: number; host: string } {
    let port = 5000;
    let host = "localhost";
    for (const arg of args) {
        if      (arg.startsWith("--port=")) port = Number(arg.slice("--port=".length)) || port;
        else if (arg.startsWith("--host=")) host = arg.slice("--host=".length) || host;
    }
    return { port, host };
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
    const { port, host } = parseFlags(args);

    console.log(`→ Site dir : ${config.siteDir}`);

    // Initial scan + build of every local bloc. The same `built` map is then
    // passed to both the repo (BlocsStore reads from it) and the watcher
    // (mutates it on rebuild) — so live-reload propagates without any extra
    // wiring on our side.
    const blocs = await scanDevBlocs(`${config.siteDir}/blocs`, { quiet: true });
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
    // `identifier` matches the seeded `dev-admin` membership row below so the
    // Profile page (getSubject → users.getBySub) resolves to a real user and
    // self-service edits work in dev.
    const auth   = new InMemoryAuthentication({ role: "admin", identifier: "dev-admin", displayName: "p9r dev" });
    // Files backend for the new /api/files surface: the site's `files/` dir IS
    // the media tree (folder = directory, name = filename, bytes = content) —
    // a plain, push-able folder. One object serves both metadata + blob.
    const files = new LocalFsCmsFiles(`${config.siteDir}/files`);
    // Re-link the media registry to what is actually on disk before serving:
    // heal files moved/renamed in the IDE (by content hash), mint ids for new
    // ones, drop orphans. The reconciled registry is committed to git — that is
    // what makes ids deterministic across clones. Silent on a clean boot.
    const recon = await files.reconcile();
    if (recon.healed.length)  console.log(`→ Reconciled ${recon.healed.length} moved file(s).`);
    if (recon.minted.length)  console.log(`→ Minted ids for ${recon.minted.length} new file(s)/folder(s).`);
    if (recon.deleted.length) console.log(`→ Dropped ${recon.deleted.length} orphaned registry entry/entries.`);
    for (const e of recon.errors) console.warn(`  ! ${e.path}: ${e.error}`);
    // The metadata WRITE seam goes through the validating decorator (name rule);
    // `files` stays the blob store + the reconcile()-capable raw handle.
    const filesMetadata = new ValidatingCmsFilesMetadata(files);

    // Auth surfaces (in-memory for dev): the membership store (authz) seeded
    // with a couple of users so the Settings → Users tab shows data, plus an
    // empty identity-provider store for the Settings → Identity tab.
    const users = new InMemoryUsersRepository<CMS_ROLES>();
    // `dev-admin` is tagged `local` so the Profile → Password card shows and the
    // password-change flow (which only applies to local accounts) is testable.
    await users.upsert({ sub: "dev-admin", displayName: "p9r dev", email: "dev@example.com", provider: "local" }, "admin");
    await users.upsert({ sub: "demo-user", displayName: "Demo User", email: "demo@example.com" }, "user");
    const identityProviders = new InMemoryIdentityProviderRepository();
    // Local credential store (authn) so the Users page can create local
    // email/password users by hand in dev, just like production. Seed one for
    // `dev-admin` so "current password" re-auth works when testing the change.
    const credentials = new InMemoryLocalCredentialStore();
    await credentials.create({ email: "dev@example.com", password: DEV_PASSWORD, displayName: "p9r dev" });
    // PAT store (authn) so the Profile → Tokens tab works in dev instead of
    // 500-ing on a missing repository.
    const pats = new InMemoryPatRepository();
    // Gateway provider store (in-memory for dev). Seeded from `siteDir/gateways/*.json`
    // (one Provider manifest per file) and shared by BOTH Control (admin CRUD +
    // preview) and Delivery (the public proxy at `/.cms/gateway/*`), so the
    // create→callable-in-Delivery chain is exercised end-to-end.
    const gateway = new ValidatingGatewayRepository(new InMemoryGatewayRepository());
    const gatewayProviders = await loadDevGateways(config.siteDir);
    if (gatewayProviders.length > 0) {
        const { created, skipped } = await seedProviders(gateway, gatewayProviders);
        console.log(`→ Gateways : ${created.length} seeded${skipped.length ? `, ${skipped.length} skipped` : ""} (${gatewayProviders.map(p => p.urn).join(", ")})`);
    }

    const runner = new BunRunner();
    // Live-reload SSE channel — registered before the ControlCms group so it
    // matches first (the group catches `/` as a fallback).
    runner.addEndpoint("GET", "/dev/reload", sseHandler(reload));

    const cms = new ControlCms(runner, repo, auth, {}, undefined, undefined, filesMetadata, files, users, identityProviders, pats, credentials, gateway);

    // Watcher → cache invalidation. Bloc rebuild flips bytes in `built`; we
    // still need to drop the editor-script (consolidated bundle) and the
    // per-bloc cached response so the next fetch sees fresh JS.
    reload.subscribe(tag => {
        cms.cache.delete(P9R_CACHE.EDITOR_SCRIPT);
        cms.cache.delete(P9R_CACHE.bloc(tag));
        console.log(`[watch] Rebuilt ${tag} — caches invalidated, browser reload signaled.`);
    });
    const registry = createBlocRegistry(`${config.siteDir}/blocs`, blocs, built, reload);

    runner.start(port);

    // Public Delivery preview on a SECOND port — the actual rendered site
    // (pages, srcset image optimization, theme) that the editor authors. Shares
    // the same repo + files; variants land in a hidden `.cms-variants/` blob so
    // you can watch an <img> upgrade to a responsive `srcset` on refresh.
    // (In MODE=DEV the render cache bypasses, so a refresh re-renders and the
    // srcset appears once the background worker has generated — no PROD needed.)
    const deliveryPort = port + 1;
    const deliveryRunner = new BunRunner();
    const variantStore = new LocalFsCmsFilesBlob(`${config.siteDir}/.cms-variants`);
    new DeliveryCms({ runner: deliveryRunner, repository: repo, filesMetadata, filesBlob: files, variantStore, gateway });
    deliveryRunner.start(deliveryPort);

    console.log("");
    console.log(`✓ Dev server ready on http://${host}:${port}`);
    console.log(`  Editor   : http://${host}:${port}/editor/page?id=/`);
    console.log(`  Admin    : http://${host}:${port}/admin/pages`);
    console.log(`  Public   : http://${host}:${deliveryPort}/  (rendered site + image optimization)`);
    console.log(`  Repo     : ${config.siteDir} (writes go straight to disk)`);
    console.log(`  Profile  : dev-admin / current password "${DEV_PASSWORD}" (Profile → Password)`);
    console.log(`  Watching : ${blocs.length} bloc folder(s) — edit + auto-reload`);
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
