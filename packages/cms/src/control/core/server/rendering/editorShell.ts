import { parseHTML } from "linkedom";
import type { ControlCms } from "src/control/ControlCms";
import { P9R_ID } from "src/socle/constants/p9r-constants";
import { send_html } from "../send_html";

/**
 * Shared logic for the three editor flavors (page / template / snippet).
 *
 * Each flavor's `editor.server.ts` handler reads its own data from the
 * repository and then calls this function with:
 *   - `flavor`               : "page" | "template" | "snippet" — stamped on
 *                              `#editor-system[data-flavor]` so the editor
 *                              bundle can select the right boot logic.
 *   - `content`              : HTML injected into `#editor.innerHTML`.
 *   - `configElement` + attrs: a custom element appended inside
 *                              `#editor-system` carrying the flavor's
 *                              default values (title, path, tags, …).
 *   - `editorSystemAttributes`: optional extras on `#editor-system`.
 *
 * Every resource URL is absolute — basePath comes from the scoped runner at
 * render time, so the shell is the only place that needs to know where we
 * are mounted. The HTML template keeps no `<script>` or `<link>` tags; we
 * inject them here with basePath-prefixed URLs, which is also what lets all
 * three flavors share a single `editor.html` file.
 */
export type EditorFlavor = "page" | "template" | "snippet";

export type EditorShellOptions = {
    /** Absolute path to the shared `editor.html` file. */
    htmlFilePath: string;
    cms: ControlCms;
    flavor: EditorFlavor;
    /** HTML that becomes `#editor.innerHTML` — must already be snippet-expanded. */
    content: string;
    /** Tag name of the configuration element to append to `#editor-system`. */
    configElement: string;
    /** Attributes to set on the configuration element. */
    configAttributes: Record<string, string>;
    /** Optional extra attributes to set on `#editor-system` alongside data-flavor. */
    editorSystemAttributes?: Record<string, string>;
};

export async function renderEditorShell(options: EditorShellOptions): Promise<Response> {
    const html = await Bun.file(options.htmlFilePath).text();
    const { document } = parseHTML(html);

    const basePath = options.cms.basePath;

    // ── Meta tags ──────────────────────────────────────────────────────
    const apiBaseMeta = document.createElement("meta");
    apiBaseMeta.setAttribute("name", "p9r-api-base");
    apiBaseMeta.setAttribute("content", `${basePath}/api/`);
    document.head.appendChild(apiBaseMeta);

    const basePathMeta = document.createElement("meta");
    basePathMeta.setAttribute("name", "p9r-base-path");
    basePathMeta.setAttribute("content", `${basePath}/`);
    document.head.appendChild(basePathMeta);

    // ── Stylesheets ────────────────────────────────────────────────────
    for (const href of [
        `${basePath}/resources/css/design-system-1.css`,
        `${basePath}/resources/css/editor.css`,
        `${basePath}/resources/css/style.css`,
    ]) {
        const link = document.createElement("link");
        link.setAttribute("rel",  "stylesheet");
        link.setAttribute("href", href);
        document.head.appendChild(link);
    }

    // ── Scripts ────────────────────────────────────────────────────────
    // `editor-script` — the consolidated runtime + every bloc's editorJS +
    // viewJS concatenated (see `admin-ui/editor-script.server.ts`).
    // `script` — the shared admin shell (AdminLayout + Media widgets).
    // Both are deferred so they run post-parse in document order.
    for (const src of [
        `${basePath}/admin/script.js`,
        `${basePath}/admin/editor-script`
    ]) {
        const script = document.createElement("script");
        script.setAttribute("src",   src);
        document.head.appendChild(script);
    }

    // ── #editor-system + configuration element ─────────────────────────
    const editorSystem = document.getElementById(P9R_ID.EDITOR_SYSTEM)!;
    const editor = document.getElementById(P9R_ID.EDITOR)!;

    editorSystem.setAttribute("data-flavor", options.flavor);
    if (options.editorSystemAttributes) {
        for (const [key, value] of Object.entries(options.editorSystemAttributes)) {
            editorSystem.setAttribute(key, value);
        }
    }

    const config = document.createElement(options.configElement);
    for (const [key, value] of Object.entries(options.configAttributes)) {
        config.setAttribute(key, value);
    }
    editorSystem.append(config);

    editor.innerHTML = options.content;

    return send_html(document.toString());
}
