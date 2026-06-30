/** Discovers sources and value sync controls, then owns their lifecycle. */

import { Source } from "../source/Source";
import { type SourceStatusValue } from "../source/sourceStatus";
import { ParamSync, PARAM_SYNC_ATTR } from "../params/ParamSync";
import { PageStateSync, PAGE_STATE_ATTR } from "../params/PageStateSync";
import { type FilterMap } from "../interpolate";
import { BIND_STOP_ATTR, BINDING_CORE_TAG, SOURCE_ATTR, type SourceState } from "../attrs";
import { eachMatching } from "./discovery";
import { revealInertSources, revealSources } from "./revealSources";
import { sourceStatusScope } from "./sourceStatusScope";
import { sourceUrl } from "../source/sourceSpec";
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
                if (r.type === "attributes") {
                    this.reconcileAttribute(r.target, r.attributeName);
                    continue;
                }
                r.removedNodes.forEach((n) => this.unregisterWithin(n));
                r.addedNodes.forEach((n) => {
                    revealInertSources(n);
                    this.registerWithin(n);
                });
            }
        });
        this.observer.observe(this.root, {
            attributes: true,
            attributeFilter: [SOURCE_ATTR, PARAM_SYNC_ATTR, PAGE_STATE_ATTR],
            childList: true,
            subtree: true,
        });
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
            this.registerSource(el);
        });
        eachMatching(node, PARAM_SYNC_ATTR, this.root, (el) => {
            this.registerParamSync(el);
        });
        eachMatching(node, PAGE_STATE_ATTR, this.root, (el) => {
            this.registerPageStateSync(el);
        });
    }

    private unregisterWithin(node: Node): void {
        eachMatching(node, SOURCE_ATTR, this.root, (el) => {
            this.unregisterSource(el);
        });
        eachMatching(node, PARAM_SYNC_ATTR, this.root, (el) => {
            this.unregisterParamSync(el);
        });
        eachMatching(node, PAGE_STATE_ATTR, this.root, (el) => {
            this.unregisterPageStateSync(el);
        });
    }

    private reconcileAttribute(target: Node, attr: string | null): void {
        if (target.nodeType !== Node.ELEMENT_NODE || !attr) return;
        const el = target as Element;
        if (!this.isInScope(el)) return;

        if (attr === SOURCE_ATTR) {
            if (!el.hasAttribute(SOURCE_ATTR) || !this.hasSourceUrl(el)) {
                this.unregisterSource(el);
                return;
            }
            const existing = this.sources.get(el);
            if (existing) void existing.run({ onlyIfUrlChanged: true });
            else this.registerSource(el);
            return;
        }

        if (attr === PARAM_SYNC_ATTR) {
            if (el.hasAttribute(PARAM_SYNC_ATTR)) this.registerParamSync(el);
            else this.unregisterParamSync(el);
            return;
        }

        if (attr === PAGE_STATE_ATTR) {
            if (el.hasAttribute(PAGE_STATE_ATTR)) this.registerPageStateSync(el);
            else this.unregisterPageStateSync(el);
        }
    }

    private registerSource(el: Element): void {
        if (!el.isConnected || this.sources.has(el) || !this.hasSourceUrl(el)) return;
        const src = new Source(el, this.filters, {
            ...this.options,
            setSourceStatus:  (source, status) => this.sourceStatuses.set(source, status),
            sourceStatusesFor: (source, current) => sourceStatusScope(this.root, this.sourceStatuses, source, current),
            afterSourceRender: (source) => {
                if (!this.stopped && source.isConnected) this.registerWithin(source);
            },
        });
        this.sources.set(el, src);
        src.start();
    }

    private unregisterSource(el: Element): void {
        const src = this.sources.get(el);
        if (!src) return;
        src.dispose();
        this.sources.delete(el);
        this.sourceStatuses.delete(el);
    }

    private registerParamSync(el: Element): void {
        if (!el.isConnected || this.paramSyncs.has(el)) return;
        const ps = new ParamSync(el);
        this.paramSyncs.set(el, ps);
        ps.start();
    }

    private unregisterParamSync(el: Element): void {
        const ps = this.paramSyncs.get(el);
        if (!ps) return;
        ps.dispose();
        this.paramSyncs.delete(el);
    }

    private registerPageStateSync(el: Element): void {
        if (!el.isConnected || this.pageStateSyncs.has(el)) return;
        const ps = new PageStateSync(el);
        this.pageStateSyncs.set(el, ps);
        ps.start();
    }

    private unregisterPageStateSync(el: Element): void {
        const ps = this.pageStateSyncs.get(el);
        if (!ps) return;
        ps.dispose();
        this.pageStateSyncs.delete(el);
    }

    private hasSourceUrl(el: Element): boolean {
        return sourceUrl(el.getAttribute(SOURCE_ATTR) ?? "").trim() !== "";
    }

    private isInScope(el: Element): boolean {
        if (el !== this.root && !this.root.contains(el)) return false;
        for (let p = el.parentElement; p && p !== this.root; p = p.parentElement) {
            if (p.localName === BINDING_CORE_TAG || p.hasAttribute(BIND_STOP_ATTR)) return false;
        }
        return true;
    }

}
