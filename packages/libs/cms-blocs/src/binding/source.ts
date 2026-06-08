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

/** Space-separated event names in this attribute re-run the source. */
export const RELOAD_ATTR = "cms-reload-on";
/** Always-listened global event — `document.dispatchEvent(new Event(...))`
 *  reloads every live source. */
export const RELOAD_EVENT = "cms-source:reload";
/** Set on a source once it has been activated; the cloak CSS reveals it.
 *  Until then `[cms-source]:not([cms-ready])` is hidden, so the raw template
 *  (un-interpolated tokens) never paints. */
export const READY_ATTR = "cms-ready";

export class Source {
    private readonly captured: Captured;
    private abort: AbortController | null = null;
    private reloadEvents: string[] = [];
    private paramReactive = false;
    private readonly onReload = () => { if (this.el.isConnected) void this.run(); };

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

    private listen(): void {
        const named = (this.el.getAttribute(RELOAD_ATTR) ?? "").split(/\s+/).filter(Boolean);
        this.reloadEvents = [RELOAD_EVENT, ...named];
        for (const ev of this.reloadEvents) document.addEventListener(ev, this.onReload);

        // A `#{param}`-dependent source reloads when the query params change —
        // via setParam (PARAMS_CHANGE_EVENT) or the browser back/forward (popstate).
        if (hasParamTokens(this.el.getAttribute(SOURCE_ATTR) ?? "")) {
            this.paramReactive = true;
            document.addEventListener(PARAMS_CHANGE_EVENT, this.onReload);
            window.addEventListener("popstate", this.onReload);
        }
    }

    private unlisten(): void {
        for (const ev of this.reloadEvents) document.removeEventListener(ev, this.onReload);
        this.reloadEvents = [];
        if (this.paramReactive) {
            document.removeEventListener(PARAMS_CHANGE_EVENT, this.onReload);
            window.removeEventListener("popstate", this.onReload);
            this.paramReactive = false;
        }
    }

    async run(): Promise<void> {
        const raw = this.el.getAttribute(SOURCE_ATTR)?.trim();
        if (!raw) return;
        // Resolve `#{param}` against the current query string just before fetch.
        const url = resolveParams(raw);

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
