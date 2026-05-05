import { getMetaBasePath } from "../../dom/meta/getMetaBasePath";
import resolveApiUrl from "../../dom/meta/resolveApiUrl";
import { Editor } from "../Editor/Editor";

const EDIT_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;

/**
 * Editor for `<w13c-snippet>` references. Snippets are external content blocks
 * so duplication and component-swap don't make sense — only delete and a
 * custom "Edit snippet" action that opens the snippet editor in a new tab.
 *
 * The BlocActionGroup reads `variant === "snippet"` to style itself differently
 * (different colour), signalling that this is not a regular bloc.
 */
export class SnippetEditor extends Editor {

    constructor(target: HTMLElement) {
        super(target, "");

        target.setAttribute(p9r.attr.ACTION.DISABLE_DUPLICATE, "true");

        this.variant = "snippet";

        this.addCustomAction({
            action: "editSnippet",
            title: "Edit snippet",
            icon: EDIT_ICON,
            handler: async () => {
                const identifier = target.getAttribute("identifier");
                if (!identifier) return;
                try {
                    const apiUrl = resolveApiUrl("snippet");
                    apiUrl.searchParams.set("identifier", identifier);
                    const res = await fetch(apiUrl);
                    if (!res.ok) return;
                    const snippet = await res.json() as { id: string };
                    const base = getMetaBasePath() ?? "/";
                    const root = base === "/" ? "" : base.replace(/\/$/, "");
                    window.open(
                        `${root}/editor/snippet?id=${encodeURIComponent(snippet.id)}`,
                        "_blank"
                    );
                } catch { /* ignore */ }
            }
        });
    }

    init() {}
    restore() {}
}
