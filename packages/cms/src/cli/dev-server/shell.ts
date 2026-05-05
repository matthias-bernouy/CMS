import { parseHTML } from "linkedom";
import { readFile } from "node:fs/promises";
import type { BuiltBloc } from "./build";
import type { ScratchPage } from "./scratch";

export type RemoteBloc = { id: string; editorJS: string };

export type ShellContext = {
    editorHtmlPath: string;
    adminPrefix: string;
    devBlocs: Map<string, BuiltBloc>;
    remoteBlocs: RemoteBloc[];
    scratch: ScratchPage;
};

/**
 * Assembles the editor HTML for local dev. Mirrors `renderEditorShell` on the
 * server side: injects the p9r meta tags, the consolidated editor-script
 * (served locally by this dev server — contains the runtime plus every dev +
 * remote bloc's `editorJS` concatenated in evaluation order) and one
 * `<script src="/bloc?tag=X">` per bloc for view JS. Dev blocs shadow remote
 * blocs that share the same tag.
 */
export async function buildShell(ctx: ShellContext): Promise<string> {
    const merged = new Map<string, RemoteBloc>();
    for (const r of ctx.remoteBlocs) merged.set(r.id, r);
    for (const [tag, b] of ctx.devBlocs) {
        if (b.editorJS) merged.set(tag, { id: tag, editorJS: b.editorJS });
        else merged.delete(tag);
    }

    const rawHtml = await readFile(ctx.editorHtmlPath, "utf-8");
    const { document } = parseHTML(rawHtml);

    const apiBase = document.createElement("meta");
    apiBase.setAttribute("name", "p9r-api-base");
    apiBase.setAttribute("content", `${ctx.adminPrefix}/api/`);
    document.head.appendChild(apiBase);

    const basePathMeta = document.createElement("meta");
    basePathMeta.setAttribute("name", "p9r-base-path");
    basePathMeta.setAttribute("content", `${ctx.adminPrefix}/`);
    document.head.appendChild(basePathMeta);

    // Consolidated editor bundle (runtime + all editorJS). View JS stays as
    // per-bloc <script> tags below so dev blocs stay cheap to rebuild.
    const editorScript = document.createElement("script");
    editorScript.setAttribute("src",   `${ctx.adminPrefix}/admin/editor-script`);
    editorScript.setAttribute("defer", "");
    document.head.appendChild(editorScript);

    for (const id of merged.keys()) {
        const s = document.createElement("script");
        s.setAttribute("src",   `/bloc?tag=${id}`);
        s.setAttribute("defer", "");
        document.head.appendChild(s);
    }

    const editorSystem = document.getElementById("editor-system");
    const editor = document.getElementById("editor");

    editorSystem?.setAttribute("data-flavor", "page");

    const scratch = ctx.scratch;
    const pageInfo = document.createElement("w13c-page-information");
    pageInfo.setAttribute("default-title",       scratch.title);
    pageInfo.setAttribute("default-description", scratch.description);
    pageInfo.setAttribute("default-path",        scratch.path);
    pageInfo.setAttribute("default-visible",     scratch.visible ? "on" : "off");
    pageInfo.setAttribute("default-tags",        scratch.tags);
    editorSystem?.append(pageInfo);

    if (editor) editor.innerHTML = scratch.content || "<p></p>";

    const liveReload = document.createElement("script");
    liveReload.textContent = LIVE_RELOAD_SCRIPT;
    document.head.appendChild(liveReload);

    return document.toString();
}

const LIVE_RELOAD_SCRIPT = `
(function() {
    if (window.__p9rLiveReload) return;
    window.__p9rLiveReload = true;
    const connect = () => {
        const es = new EventSource("/dev/reload");
        es.addEventListener("reload", (ev) => {
            console.log("[p9r-dev] Rebuilt " + ev.data + " — reloading");
            location.reload();
        });
        es.addEventListener("error", () => {
            es.close();
            setTimeout(connect, 1000);
        });
    };
    connect();
})();
`;

/**
 * Fetched once at startup instead of per-request so a flaky or offline CMS
 * doesn't spam the logs on every editor reload (hot reload reopens the shell
 * many times in a short window).
 */
export async function fetchRemoteBlocs(adminBase: URL, token: string): Promise<RemoteBloc[]> {
    const url = new URL("api/blocs", adminBase).href;
    try {
        const res = await fetch(url, {
            headers: { "Authorization": `Bearer ${token}` },
        });
        if (!res.ok) {
            console.warn(`[remote] GET ${url} → ${res.status} — continuing with dev blocs only`);
            return [];
        }
        const data = await res.json();
        if (!Array.isArray(data)) {
            console.warn(`[remote] GET ${url} did not return an array — ignoring`);
            return [];
        }
        return data as RemoteBloc[];
    } catch (e) {
        console.warn(`[remote] Failed to reach CMS at ${url}: ${e instanceof Error ? e.message : e}`);
        console.warn(`[remote] Continuing with dev blocs only. Fix P9R_URL or start the CMS and restart \`p9r dev\`.`);
        return [];
    }
}

/**
 * Builds the consolidated editor bundle served at
 * `<adminPrefix>/admin/editor-script` in dev. Mirrors the production
 * endpoint (`admin-ui/editor-script.server.ts`) but sources the bloc
 * payload from dev blocs + the remote snapshot instead of the DB.
 *
 * `viewJS` for each bloc is still loaded per-tag via `/bloc?tag=X` so a
 * dev rebuild only needs to refresh that one endpoint — no need to re-fetch
 * every remote viewJS on reload.
 */
export async function buildEditorScript(ctx: {
    packageRoot: string;
    devBlocs: Map<string, BuiltBloc>;
    remoteBlocs: RemoteBloc[];
}): Promise<string> {
    const entry = `${ctx.packageRoot}/src/control/editor/editor-script-entry.ts`;
    const result = await Bun.build({ entrypoints: [entry], format: "iife" });
    const output = result.outputs[0];
    if (!output) {
        const logs = result.logs.map(l => l.message).join("\n");
        throw new Error(`editor-script runtime build failed: ${logs || "no output"}`);
    }
    const runtime = await output.text();

    const merged = new Map<string, string>();
    for (const r of ctx.remoteBlocs) merged.set(r.id, r.editorJS);
    for (const [tag, b] of ctx.devBlocs) {
        if (b.editorJS) merged.set(tag, b.editorJS);
        else merged.delete(tag);
    }

    const editorPayload = [...merged.entries()]
        .map(([id, js]) => `try { ${js} } catch (e) { console.error("Error in bloc ${id} editorJS:", e); }`)
        .join("\n");

    return `${runtime}\n${editorPayload}`;
}
