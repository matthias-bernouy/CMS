/** Discovers sources and value sync controls, then owns their lifecycle. */

import { Source } from "../source/Source";
import { type SourceStatusValue } from "../source/sourceStatus";
import { ParamSync, PARAM_SYNC_ATTR } from "../params/ParamSync";
import { PageStateSync, PAGE_STATE_ATTR } from "../params/PageStateSync";
import { type FilterMap } from "../interpolate";
import { SOURCE_ATTR, type SourceState } from "../attrs";
import { eachMatching } from "./discovery";
import { revealInertSources, revealSources } from "./revealSources";
import { sourceStatusScope } from "./sourceStatusScope";
export { revealSources } from "./revealSources";

/** Owns the source/value-sync registries and the discovery observer for one root. */
export class BindingRuntime {
    private readonly sources = new Map<Element, Source>();
    private readonly sourceStatuses = new Map<Element, SourceStatusValue>();
    private readonly paramSyncs = new Map<Element, ParamSync>();
    private readonly pageStateSyncs = new Map<Element, PageStateSync>();
    private observer: MutationObserver | null = null;
    private stopped = false;

    constructor(
        private readonly root: Element,
        private readonly filters: FilterMap = {},
        private readonly options: { sourceStateForce?: SourceState } = {},
    ) {}

    /** Activate after DOMContentLoaded while parsing so source children exist. */
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
        const MutationObserverCtor = this.root.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
        this.observer = new MutationObserverCtor((records) => {
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

    /** Revert sources to authored templates, then tear down the runtime. */
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
        for (const ps of this.pageStateSyncs.values()) ps.dispose();
        this.sources.clear();
        this.sourceStatuses.clear();
        this.paramSyncs.clear();
        this.pageStateSyncs.clear();
        hooks?.afterDispose?.();
    }

    get isStopped(): boolean {
        return this.stopped;
    }

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
            const src = new Source(el, this.filters, {
                ...this.options,
                setSourceStatus:  (source, status) => this.sourceStatuses.set(source, status),
                sourceStatusesFor: (source, current) => sourceStatusScope(this.root, this.sourceStatuses, source, current),
            });
            this.sources.set(el, src);
            src.start();
        });
        eachMatching(node, PARAM_SYNC_ATTR, this.root, (el) => {
            if (!el.isConnected || this.paramSyncs.has(el)) return;
            const ps = new ParamSync(el);
            this.paramSyncs.set(el, ps);
            ps.start();
        });
        eachMatching(node, PAGE_STATE_ATTR, this.root, (el) => {
            if (!el.isConnected || this.pageStateSyncs.has(el)) return;
            const ps = new PageStateSync(el);
            this.pageStateSyncs.set(el, ps);
            ps.start();
        });
    }

    private unregisterWithin(node: Node): void {
        eachMatching(node, SOURCE_ATTR, this.root, (el) => {
            const src = this.sources.get(el);
            if (!src) return;
            src.dispose();
            this.sources.delete(el);
            this.sourceStatuses.delete(el);
        });
        eachMatching(node, PARAM_SYNC_ATTR, this.root, (el) => {
            const ps = this.paramSyncs.get(el);
            if (!ps) return;
            ps.dispose();
            this.paramSyncs.delete(el);
        });
        eachMatching(node, PAGE_STATE_ATTR, this.root, (el) => {
            const ps = this.pageStateSyncs.get(el);
            if (!ps) return;
            ps.dispose();
            this.pageStateSyncs.delete(el);
        });
    }

}
