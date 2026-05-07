import { getEditorContext, type NavigationRequest } from "src/control/core/editorSystem/editorContext";
import { getMetaBasePath } from "src/control/core/dom/meta/getMetaBasePath";

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
            const id = getEditorContext().pageIdByPath.get(cls.target) ?? cls.target;
            const dest = `${getMetaBasePath()}/editor/page?id=${encodeURIComponent(id)}`;
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
