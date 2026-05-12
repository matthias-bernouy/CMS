// `p9r dev` is the local development entry point. Flag the runtime so the
// socle's security headers (CSP, COOP) downgrade to Report-Only and the
// asset cache is bypassed — both already gated on `MODE === "DEV"`. Set
// before the lazy-evaluated helpers in `src/socle/server/compression.ts`
// observe it (they read at call time, not at import time).
process.env.MODE = "DEV";

import { relative } from "node:path";
import { BunRunner } from "@bernouy/runner-bun";
import { ControlCms } from "src/control/ControlCms";
import { P9R_CACHE } from "src/socle/constants/p9r-constants";
import { InMemoryAuthentication } from "../../tests/human/InMemoryAuthentication";
import { scanDevBlocs } from "./dev-server/scan";
import { buildAllDevBlocs, type BuiltBloc } from "./dev-server/build";
import { createReloadEmitter, createBlocRegistry, type ReloadEmitter } from "./dev-server/watch";
import { LocalFsCmsRepository } from "./dev-server/repo/LocalFsCmsRepository";
import { StubMedia } from "./dev-server/stubMedia";
import { loadPushConfig } from "./push/shared/config";

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
    const repo   = new LocalFsCmsRepository(config.siteDir, built);
    const auth   = new InMemoryAuthentication({ role: "admin", displayName: "p9r dev" });
    const media  = new StubMedia();

    const runner = new BunRunner();
    // Live-reload SSE channel — registered before the ControlCms group so it
    // matches first (the group catches `/` as a fallback).
    runner.addEndpoint("GET", "/dev/reload", sseHandler(reload));

    const cms = new ControlCms(runner, repo, auth, media, { tokensUrl: "" });

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

    console.log("");
    console.log(`✓ Dev server ready on http://${host}:${port}`);
    console.log(`  Editor   : http://${host}:${port}/editor/page?id=/`);
    console.log(`  Admin    : http://${host}:${port}/admin/pages`);
    console.log(`  Repo     : ${config.siteDir} (writes go straight to disk)`);
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
