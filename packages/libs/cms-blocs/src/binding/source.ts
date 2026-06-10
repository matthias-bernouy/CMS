/**
 * The `cms-source` controller — one fetch→render cycle for a single source
 * element. Reload (`cms-reload-on`) and the lifecycle (MutationObserver,
 * teardown) come next; this class already holds the AbortController so a later
 * run supersedes an in-flight one ("last write wins" at the render).
 *
 * On construction it captures the element's content (body + state slots),
 * leaving the element empty. `run()` then:
 *   1. shows the `loading` slot (if any),
 *   2. fetches the `cms-source` URL,
 *   3. renders the slot matching the outcome:
 *      - error  → `error` slot bound with `{ status, message }` (else: clear + warn),
 *      - empty  → `empty` slot (when the payload is empty and a slot exists),
 *      - success→ the body bound with the data as the implicit scope value
 *                 (so `{{ title }}`, `cms-repeat="items"`, `{{ value }}` all read
 *                 the fetched payload).
 */

import { runFetch } from "./fetcher";
import { captureContent, renderContent, isEmpty, type Captured } from "./slots";
import { type FilterMap } from "./interpolate";
import { SOURCE_ATTR } from "./bindSubtree";
import { resolveParams, hasParamTokens, PARAMS_CHANGE_EVENT } from "./params";
import { READY_ATTR } from "./attrs";

/** Space-separated event names in this attribute re-run the source. */
export const RELOAD_ATTR = "cms-reload-on";
/** Always-listened global event — `document.dispatchEvent(new Event(...))`
 *  reloads every live source. */
export const RELOAD_EVENT = "cms-source:reload";
export class Source {
    private readonly captured: Captured;
    private abort: AbortController | null = null;
    private reloadEvents: string[] = [];
    private paramReactive = false;
    private lastUrl: string | null = null;
    /** Named/global reloads (`cms-reload-on`, `cms-source:reload`) always re-run:
     *  they mean "the data changed, refetch". */
    private readonly onReload = () => { if (this.el.isConnected) void this.run(); };
    /** Param-reactive reloads (`cms-params:change` / `popstate`) fire GLOBALLY for
     *  ANY param. Only re-run when THIS source's resolved URL actually changed, so
     *  an unrelated param (e.g. a sibling input syncing `#{q}`) doesn't re-fetch +
     *  re-render us — in the editor the page-source `#{id}` wraps the whole canvas,
     *  so an unrelated reload would re-render everything and drop the typed input's
     *  focus. */
    private readonly onParamsChange = () => { if (this.el.isConnected) void this.run({ onlyIfUrlChanged: true }); };

    constructor(private readonly el: Element, private readonly filters: FilterMap = {}) {
        this.captured = captureContent(el);
    }

    /** Wire reload listeners and kick off the first fetch. The synchronous part
     *  of `run()` has already shown the loading slot (if any) by the time we
     *  mark the element ready, so revealing it never exposes the raw template. */
    start(): void {
        this.listen();
        void this.run();
        this.el.setAttribute(READY_ATTR, "");
    }

    /** Abort any in-flight request and drop reload listeners. Called by the
     *  runtime when this source's element leaves the DOM. */
    dispose(): void {
        this.abort?.abort();
        this.abort = null;
        this.unlisten();
    }

    /** Editor support: replace the live render with the authored template (raw,
     *  un-interpolated — `{{ }}` literal, `cms-repeat` intact), aborting any
     *  in-flight fetch. The core reveals freshly-cloned nested sources. */
    renderTemplate(): void {
        this.abort?.abort();
        this.abort = null;
        renderContent(this.el, this.captured.template, null, this.filters);
    }

    private listen(): void {
        const named = (this.el.getAttribute(RELOAD_ATTR) ?? "").split(/\s+/).filter(Boolean);
        this.reloadEvents = [RELOAD_EVENT, ...named];
        for (const ev of this.reloadEvents) document.addEventListener(ev, this.onReload);

        // A `#{param}`-dependent source reloads when the query params change —
        // via setParam (PARAMS_CHANGE_EVENT) or the browser back/forward (popstate).
        if (hasParamTokens(this.el.getAttribute(SOURCE_ATTR) ?? "")) {
            this.paramReactive = true;
            document.addEventListener(PARAMS_CHANGE_EVENT, this.onParamsChange);
            window.addEventListener("popstate", this.onParamsChange);
        }
    }

    private unlisten(): void {
        for (const ev of this.reloadEvents) document.removeEventListener(ev, this.onReload);
        this.reloadEvents = [];
        if (this.paramReactive) {
            document.removeEventListener(PARAMS_CHANGE_EVENT, this.onParamsChange);
            window.removeEventListener("popstate", this.onParamsChange);
            this.paramReactive = false;
        }
    }

    async run(opts?: { onlyIfUrlChanged?: boolean }): Promise<void> {
        const raw = this.el.getAttribute(SOURCE_ATTR)?.trim();
        if (!raw) return;
        // Resolve `#{param}` against the current query string just before fetch.
        const url = resolveParams(raw);
        // Param-reactive trigger whose resolved URL didn't change → skip: the
        // cms-params:change event is global, so an unrelated param must not
        // re-fetch + re-render this source (set synchronously so back-to-back
        // changes compare against the in-flight URL).
        if (opts?.onlyIfUrlChanged && url === this.lastUrl) return;
        this.lastUrl = url;

        const { slots, body } = this.captured;
        if (slots.loading) renderContent(this.el, slots.loading, null, this.filters);

        this.abort?.abort();
        const ac = new AbortController();
        this.abort = ac;

        const outcome = await runFetch(url, ac.signal);
        if (ac.signal.aborted) return; // superseded by a newer run, or torn down

        if (outcome.kind === "aborted") return;

        if (outcome.kind === "error") {
            if (slots.error) {
                const ctx = { value: { status: outcome.status, message: outcome.message } };
                renderContent(this.el, slots.error, ctx, this.filters);
            } else {
                this.el.replaceChildren();
                console.warn(`cms-source "${url}": ${outcome.message}`);
            }
            return;
        }

        const data = outcome.data;
        if (isEmpty(data) && slots.empty) {
            renderContent(this.el, slots.empty, { value: data }, this.filters);
        } else {
            renderContent(this.el, body, { value: data }, this.filters);
        }
    }
}

/**
 * Strip runtime-only stamps (currently `cms-ready`) from `root` and its subtree.
 * Used when serializing an editor canvas back to authored content: the runtime's
 * bookkeeping must not leak into saved HTML, or on the next load the cloak would
 * reveal an un-rendered source (a raw `{{ }}` flash) before its fetch resolves.
 */
export function clearRuntimeStamps(root: Element): void {
    if (root.hasAttribute(READY_ATTR)) root.removeAttribute(READY_ATTR);
    root.querySelectorAll(`[${READY_ATTR}]`).forEach((el) => el.removeAttribute(READY_ATTR));
}
