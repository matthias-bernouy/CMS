/**
 * The binding runtime: discovers `cms-source` elements and manages their
 * lifecycle through a single `MutationObserver`. This is the piece that makes
 * nested sources and reload safe WITHOUT any source knowing about another.
 *
 * Why an observer instead of each source managing its children:
 *  - When a parent source renders its body, it may add nested `cms-source`
 *    nodes. The observer sees the additions and activates them — the parent
 *    stays oblivious.
 *  - When a parent reloads (re-renders, replacing its children), the old
 *    subtree — including any nested sources — is removed. The observer sees the
 *    removals and disposes those sources (abort fetch, drop listeners), then
 *    activates the fresh ones. No leaks, no double-fetch, no bookkeeping in the
 *    parent.
 *
 * A source's element is the map key, so an element is never registered twice.
 * Capturing a source's content empties its element, so a freshly-registered
 * source exposes no descendants to scan — its nested sources surface later,
 * when it renders them and the observer fires.
 */

import { Source } from "./source";
import { ParamSync, PARAM_SYNC_ATTR } from "./paramSync";
import { SOURCE_ATTR } from "./bindSubtree";
import { type FilterMap } from "./interpolate";
import { BINDING_CORE_TAG, BIND_STOP_ATTR, READY_ATTR } from "./attrs";

/** Owns the source/param-sync registries and the discovery observer for one root. */
export class BindingRuntime {
    private readonly sources = new Map<Element, Source>();
    private readonly paramSyncs = new Map<Element, ParamSync>();
    private observer: MutationObserver | null = null;
    private stopped = false;

    constructor(private readonly root: Element, private readonly filters: FilterMap = {}) {}

    /**
     * Activate existing sources and watch for future ones. If the document is
     * still parsing, defer the initial scan to `DOMContentLoaded`: a source
     * discovered mid-parse may not have its children (template + slots) yet, so
     * `captureContent` would capture an empty element. Once the document is
     * parsed, every source's subtree is complete.
     */
    start(): void {
        if (typeof document !== "undefined" && document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => this.activate(), { once: true });
        } else {
            this.activate();
        }
    }

    private activate(): void {
        if (this.stopped) return;
        revealInertSources(this.root);
        this.registerWithin(this.root);
        this.observer = new MutationObserver((records) => {
            for (const r of records) {
                r.removedNodes.forEach((n) => this.unregisterWithin(n));
                r.addedNodes.forEach((n) => {
                    revealInertSources(n);
                    this.registerWithin(n);
                });
            }
        });
        this.observer.observe(this.root, { childList: true, subtree: true });
    }

    /** Tear everything down — disconnect the observer and dispose all features. */
    stop(): void {
        this.teardown();
    }

    /**
     * Stop fetching and revert the DOM to the authored template: re-render every
     * source's captured body raw (un-interpolated `{{ }}`, intact `cms-repeat`),
     * then tear down (abort fetches, drop listeners, stop observing). A generic
     * runtime primitive — the CMS editor calls it to pause binding in edit mode,
     * but the runtime itself knows nothing about modes. Like `stop()`, single-use
     * after; build a fresh runtime to resume.
     */
    deactivate(): void {
        this.teardown({
            beforeSourceDispose: (src) => src.renderTemplate(),
            afterDispose: () => revealSources(this.root),
        });
    }

    private teardown(hooks?: {
        beforeSourceDispose?: (src: Source) => void;
        afterDispose?: () => void;
    }): void {
        if (this.stopped) return;
        this.stopped = true;
        this.observer?.disconnect();
        this.observer = null;
        for (const src of this.sources.values()) {
            hooks?.beforeSourceDispose?.(src);
            src.dispose();
        }
        for (const ps of this.paramSyncs.values()) ps.dispose();
        this.sources.clear();
        this.paramSyncs.clear();
        hooks?.afterDispose?.();
    }

    /** True once stopped/deactivated — `BindingRuntime` is single-use. */
    get isStopped(): boolean {
        return this.stopped;
    }

    /** Test/introspection hook: number of live sources. */
    get size(): number {
        return this.sources.size;
    }

    private registerWithin(node: Node): void {
        // Sources: skip detached elements — the initial scan's querySelectorAll
        // snapshot still lists a nested source even after registering its parent
        // captured (and so detached) it. The nested one re-surfaces — attached
        // and with its URL interpolated — when the parent renders it.
        eachMatching(node, SOURCE_ATTR, this.root, (el) => {
            if (!el.isConnected || this.sources.has(el)) return;
            const src = new Source(el, this.filters);
            this.sources.set(el, src);
            src.start();
        });
        eachMatching(node, PARAM_SYNC_ATTR, this.root, (el) => {
            if (!el.isConnected || this.paramSyncs.has(el)) return;
            const ps = new ParamSync(el);
            this.paramSyncs.set(el, ps);
            ps.start();
        });
    }

    private unregisterWithin(node: Node): void {
        eachMatching(node, SOURCE_ATTR, this.root, (el) => {
            const src = this.sources.get(el);
            if (!src) return;
            src.dispose();
            this.sources.delete(el);
        });
        eachMatching(node, PARAM_SYNC_ATTR, this.root, (el) => {
            const ps = this.paramSyncs.get(el);
            if (!ps) return;
            ps.dispose();
            this.paramSyncs.delete(el);
        });
    }
}

/**
 * Invoke `cb` for `node` and every descendant carrying `attr`, but NEVER cross
 * into a nested `<cms-binding-core>`: that core owns its own subtree (its own
 * data), and isolating it is what stops the CMS chrome's binding from mixing
 * with a site page's binding when one is nested in the other.
 */
function eachMatching(node: Node, attr: string, root: Element, cb: (el: Element) => void): void {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    // `el === root` is THIS runtime's own scan root — it is never "behind a
    // boundary" relative to itself. Skipping the guard here is what lets a core
    // nested inside an outer boundary (a `[cms-bind-stop]` region, or another
    // core) still drive its OWN subtree: `crossesBoundary(root, root)` would
    // otherwise walk ABOVE root, hit that outer boundary, and wrongly bail.
    // Only a descendant / observer-added node can legitimately be behind a
    // boundary relative to root (handled by the per-element check below).
    if (el !== root && crossesBoundary(el, root)) return;
    if (el.hasAttribute(attr)) cb(el);
    el.querySelectorAll(`[${attr}]`).forEach((inner) => {
        if (!crossesBoundary(inner, root)) cb(inner);
    });
}

/**
 * True if a discovery boundary sits strictly between `el` and `root`: a nested
 * `<cms-binding-core>` (which owns its own data) OR a `[cms-bind-stop]` region
 * (the editor's inert canvas content). Either isolates that subtree from this
 * runtime, so its sources are never registered/executed here.
 */
function crossesBoundary(el: Element, root: Element): boolean {
    for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
        if (p.localName === BINDING_CORE_TAG || p.hasAttribute(BIND_STOP_ATTR)) return true;
    }
    return false;
}

export function revealSources(root: Node): void {
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    const el = root as Element;
    if (el.hasAttribute(SOURCE_ATTR)) el.setAttribute(READY_ATTR, "");
    el.querySelectorAll(`[${SOURCE_ATTR}]:not([${READY_ATTR}])`)
        .forEach((source) => source.setAttribute(READY_ATTR, ""));
}

function revealInertSources(root: Node): void {
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    const el = root as Element;
    if (el.hasAttribute(BIND_STOP_ATTR)) {
        revealSources(el);
        return;
    }
    el.querySelectorAll(`[${BIND_STOP_ATTR}]`).forEach(revealSources);
}
