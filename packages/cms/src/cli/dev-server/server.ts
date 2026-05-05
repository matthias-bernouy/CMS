import { join } from "node:path";
import type { BuiltBloc } from "./build";
import { buildShell, buildEditorScript } from "./shell";
import { findBlockingRule, blockedResponse } from "./write-guard";
import { proxyRequest } from "./proxy";
import { loadScratch, saveScratch, type ScratchPage } from "./scratch";
import type { ReloadEmitter } from "./watch";
import type { RemoteBloc } from "./shell";

export type ServerConfig = {
    port: number;
    host: string;
    adminBase: URL;
    publicOrigin: string;
    token: string;
    devBlocs: Map<string, BuiltBloc>;
    remoteBlocs: RemoteBloc[];
    packageRoot: string;
    cwd: string;
    reload: ReloadEmitter;
};

export type ServerHandle = {
    url: string;
    editorUrl: string;
    stop: () => void;
};

export function startDevServer(config: ServerConfig): ServerHandle {
    const adminPrefix = config.adminBase.pathname.replace(/\/$/, "") || "";
    const editorHtmlPath = join(config.packageRoot, "src/control/endpoints/admin-ui/editor/editor.html");
    const editorPath = `${adminPrefix}/admin/editor`;
    const editorScriptPath = `${adminPrefix}/admin/editor-script`;

    const server = Bun.serve({
        port: config.port,
        hostname: config.host,
        async fetch(req) {
            const url = new URL(req.url);
            const path = url.pathname;

            // Root → editor
            if (path === "/" || path === "") {
                return Response.redirect(editorPath, 302);
            }

            // SSE reload channel — one message per rebuilt bloc
            if (req.method === "GET" && path === "/dev/reload") {
                return sseResponse(req, config.reload);
            }

            // Consolidated editor runtime + bloc editorJS — rebuilt every
            // request. Cheap enough in dev (Bun.build is sub-second on this
            // entry) and it keeps live-reload simple: editing a bloc rebuilds
            // its editorJS, and the next editor reload picks it up.
            if (req.method === "GET" && path === editorScriptPath) {
                try {
                    const js = await buildEditorScript({
                        packageRoot: config.packageRoot,
                        devBlocs:    config.devBlocs,
                        remoteBlocs: config.remoteBlocs,
                    });
                    return new Response(js, {
                        headers: {
                            "Content-Type":  "application/javascript; charset=utf-8",
                            "Cache-Control": "no-store",
                        },
                    });
                } catch (e) {
                    console.error(`[editor-script] ${e instanceof Error ? e.message : e}`);
                    return new Response("editor-script build failed", { status: 500 });
                }
            }

            // Editor shell — assembled locally
            if (req.method === "GET" && path === editorPath) {
                try {
                    const scratch = await loadScratch(config.cwd);
                    const html = await buildShell({
                        editorHtmlPath,
                        adminPrefix,
                        devBlocs: config.devBlocs,
                        remoteBlocs: config.remoteBlocs,
                        scratch,
                    });
                    return new Response(html, {
                        headers: {
                            "Content-Type": "text/html; charset=utf-8",
                            "Cache-Control": "no-store",
                        },
                    });
                } catch (e) {
                    console.error(`[shell] ${e instanceof Error ? e.message : e}`);
                    return new Response("Failed to assemble editor shell", { status: 500 });
                }
            }

            // POST /api/page → write to scratch.json instead of the remote CMS
            if (req.method === "POST" && path === `${adminPrefix}/api/page`) {
                try {
                    const body = await req.json() as Partial<ScratchPage>;
                    const saved = await saveScratch(config.cwd, {
                        content: body.content ?? "",
                        path: body.path ?? "/dev",
                        title: body.title ?? "Dev page",
                        description: body.description ?? "",
                        visible: body.visible ?? true,
                        tags: typeof body.tags === "string" ? body.tags : "",
                    });
                    console.log(`[scratch] Saved ${saved.content.length} bytes → ${saved.path}`);
                    return new Response("Scratch saved", { status: 200 });
                } catch (e) {
                    console.error(`[scratch] Save failed: ${e instanceof Error ? e.message : e}`);
                    return new Response("Scratch save failed", { status: 500 });
                }
            }

            // /bloc?tag=X — local dev bloc shadows remote
            if (req.method === "GET" && path === "/bloc") {
                const tag = url.searchParams.get("tag") || "";
                const dev = config.devBlocs.get(tag);
                if (dev) {
                    return new Response(dev.viewJS, {
                        headers: {
                            "Content-Type": "application/javascript; charset=utf-8",
                            "Cache-Control": "no-store",
                        },
                    });
                }
                return proxyRequest(req, `${config.publicOrigin}/bloc?tag=${encodeURIComponent(tag)}`, config);
            }

            // Write guard on admin API
            if (path.startsWith(`${adminPrefix}/api/`)) {
                const rule = findBlockingRule(req.method, path);
                if (rule) {
                    console.log(`[guard] Blocked ${req.method} ${path} (${rule.label})`);
                    return blockedResponse(rule, path);
                }
            }

            // Everything else → proxy to the remote CMS (admin UI assets, CSS,
            // API reads, public routes, …)
            return proxyRequest(req, `${config.publicOrigin}${path}${url.search}`, config);
        },
    });

    return {
        url: `http://${config.host}:${server.port}`,
        editorUrl: `http://${config.host}:${server.port}${editorPath}`,
        stop: () => server.stop(),
    };
}

function sseResponse(req: Request, reload: ReloadEmitter): Response {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            const enqueue = (chunk: string) => {
                try { controller.enqueue(encoder.encode(chunk)); }
                catch { /* stream already closed */ }
            };

            enqueue(": connected\n\n");

            const unsubscribe = reload.subscribe((tag) => {
                enqueue(`event: reload\ndata: ${tag}\n\n`);
            });

            const keepAlive = setInterval(() => enqueue(": ping\n\n"), 25_000);

            const cleanup = () => {
                clearInterval(keepAlive);
                unsubscribe();
                try { controller.close(); } catch {}
            };

            req.signal.addEventListener("abort", cleanup, { once: true });
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
        },
    });
}
