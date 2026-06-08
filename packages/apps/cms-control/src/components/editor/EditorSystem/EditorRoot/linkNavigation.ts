import { getEditorContext, type NavigationRequest } from "cms-control/core/editorSystem/editorContext";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";

/**
 * Default `requestNavigation` handler wired by EditorRoot. Routes each
 * classified link to the right action — jump to the editor for internal
 * pages, open external/asset links in a new tab, scroll within the
 * preview for anchor refs, defer to the browser for `mailto:` & co.
 *
 * Lives in `EditorRoot/` because the redirect URL pattern (`/editor/page`)
 * is owned by the editor shell, not by the core editor system.
 */
export function resolveTargetForLink(req: NavigationRequest): void {
    const { classification: cls, href } = req;

    switch (cls.kind) {
        case "page": {
            // Editor URL keys pages by `id`, but link hrefs are paths.
            // Resolve via the editor context's path→id map (populated by
            // EditorRoot from `/api/page/list`); fall back to the path
            // itself for in-memory dev where id === path.
            const ctx = getEditorContext();
            const id  = ctx.pageIdByPath.get(cls.target) ?? cls.target;
            const params = new URLSearchParams({ id });
            // Persist the current mode across the cross-editor jump — if
            // the user was previewing, they stay previewing on the next page.
            if (ctx.mode === "view") params.set("mode", "view");
            // Forward the original href's query params so page-level blocs
            // that rely on URL state (e.g. `<div cms-source="…?id=#{i}">`
            // on `/annonce?i=<uuid>`) still receive their inputs through
            // the cross-editor jump. Page params coexist with the editor's
            // own `id` / `mode` — namespace collisions are the caller's
            // responsibility for now (TODO: move editor state to
            // sessionStorage so the URL is fully page-owned).
            try {
                const original = new URL(href, location.origin);
                for (const [k, v] of original.searchParams) {
                    params.append(k, v);
                }
            } catch { /* malformed href — fall through to bare id/mode URL */ }
            const dest = `${getMetaBasePath()}/editor/page?${params.toString()}`;
            window.location.href = dest;
            return;
        }
        case "anchor": {
            const id = cls.target;
            if (!id) return;
            // Try to scroll the matching anchor inside any open editor preview.
            const candidate =
                document.getElementById(id) ??
                document.querySelector(`[name="${CSS.escape(id)}"]`);
            candidate?.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }
        case "asset":
        case "external":
        case "mailto":
            window.open(href, "_blank", "noopener,noreferrer");
            return;
        case "empty":
            return;
    }
}
