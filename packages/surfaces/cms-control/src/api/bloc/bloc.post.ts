import type { ControlCms } from "cms-control/ControlCms";
import { Buffer } from "node:buffer";
import { posix } from "node:path";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { validateBloc } from "@bernouy/cms-bloc-compile";
import { DuplicateBlocTagError, P9R_CACHE } from "@bernouy/cms-content";
import { invalidatePagesReferencingBloc } from "cms-control/core/server/cache/invalidation";

export default async function importBloc(req: Request, cms: ControlCms) {

    const formData = await req.formData();

    const name = formData.get("name") as string;
    const group = formData.get("group") as string;
    const description = (formData.get("description") as string | null) || "";
    const tag = formData.get("tag") as string | null;
    const viewFile = formData.get("viewJS") as File;
    const editorEntry = formData.get("editorJS");
    const editorFile = editorEntry instanceof File ? editorEntry : null;
    const templateHtml = (formData.get("templateHtml") as string | null) || undefined;
    const configurationHtml = (formData.get("configurationHtml") as string | null) || undefined;
    const sourceRaw = formData.get("source");
    const source = parseSourceMap(sourceRaw);
    const force = formData.get("force") === "true";

    if (!name || !viewFile || !tag) {
        return new Response("Missing argument (name, tag, viewJS required)", { status: 400 });
    }

    const viewSource = await viewFile.text();
    const editorSource = editorFile ? await editorFile.text() : undefined;

    const validation = validateBloc({
        tag,
        viewSource,
        ...(editorSource      !== undefined ? { editorSource }      : {}),
        ...(templateHtml      !== undefined ? { templateHtml }      : {}),
        ...(configurationHtml !== undefined ? { configurationHtml } : {}),
    });
    if (validation.errors.length > 0) {
        return new Response(validation.errors.join("\n"), { status: 400 });
    }

    const existing = await cms.repository.getBlocViewJS(tag);
    if (existing !== null && !force) {
        return new Response(`Bloc with tag "${tag}" already exists`, { status: 409 });
    }

    const defaultContentResult = resolveDefaultContent(source);
    if (defaultContentResult.error) {
        return new Response(defaultContentResult.error, { status: 400 });
    }

    const bloc = await prepare_bloc(viewFile, editorFile, name, group, description, tag, source, defaultContentResult.content);

    try {
        if (force) await cms.repository.replaceBloc(bloc);
        else       await cms.repository.createBloc(bloc);
    } catch (e) {
        if (!force && e instanceof DuplicateBlocTagError) {
            return new Response(`Bloc with tag "${bloc.id}" already exists`, { status: 409 });
        }
        throw e;
    }

    // Invalidate caches: per-bloc view bundle (used by Delivery + the dev
    // CLI) and the consolidated admin editor bundle that inlines every
    // bloc's editorJS + viewJS.
    cms.cache.delete(P9R_CACHE.bloc(bloc.id));
    cms.cache.delete(P9R_CACHE.EDITOR_SCRIPT);

    // Rendered pages embedding this bloc now carry a stale `?v=<hash>` in
    // their `<script src="/bloc?tag=...">` tag — re-render them on next hit.
    // Pages that don't reference this bloc keep their cached HTML (and the
    // image-optimization srcsets already baked in).
    await invalidatePagesReferencingBloc(cms, bloc.id);

    return new Response("Bloc imported");
}

/**
 * Parse the optional `source` multipart field (JSON object: relative path →
 * base64 content). Returns `undefined` when absent or empty.
 */
function parseSourceMap(raw: FormDataEntryValue | null): Record<string, string> | undefined {
    if (raw === null || raw === "") return undefined;
    if (typeof raw !== "string") return undefined;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === "string") out[k] = v;
        }
        return Object.keys(out).length > 0 ? out : undefined;
    } catch {
        return undefined;
    }
}

function resolveDefaultContent(source: Record<string, string> | undefined): { content?: string; error?: string } {
    if (!source) return {};

    const manifestRaw = source["manifest.json"] ?? source["./manifest.json"];
    if (!manifestRaw) return {};

    let manifest: unknown;
    try {
        manifest = JSON.parse(decodeSourceFile(manifestRaw));
    } catch {
        return { error: "Invalid manifest.json" };
    }

    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return {};
    const value = (manifest as { defaultContent?: unknown }).defaultContent;
    if (value === undefined || value === null || value === "") return {};
    if (typeof value !== "string") return { error: "manifest.defaultContent must be a file path" };

    const normalizedPath = normalizeSourcePath(value);
    if (!normalizedPath) return { error: "manifest.defaultContent must be a relative file path" };

    const encoded = source[normalizedPath] ?? source[`./${normalizedPath}`];
    if (!encoded) return { error: `manifest.defaultContent file "${normalizedPath}" not found in source bundle` };

    return { content: decodeSourceFile(encoded) };
}

function normalizeSourcePath(path: string): string | null {
    if (path.startsWith("/") || path.includes("\0")) return null;

    const normalized = posix.normalize(path).replace(/^\.\//, "");
    if (!normalized || normalized === "." || normalized.startsWith("../")) return null;

    return normalized;
}

function decodeSourceFile(encoded: string): string {
    return Buffer.from(encoded, "base64").toString("utf8");
}
