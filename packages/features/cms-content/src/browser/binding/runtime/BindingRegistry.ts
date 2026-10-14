import { BINDING_CORE_TAG, QUERY_ATTR, SOURCE_ATTR } from "../core/attrs";
import type { FilterMap } from "../core/interpolate";
import { SyncControl } from "../params/SyncControl";
import { Query } from "./query/Query";
import { Source } from "../source/Source";
import type { SourceStatusValue } from "../source/presentation/sourceStatus";
import { sourceStatusScope } from "./sourceStatusScope";

export class BindingRegistry {
    private readonly queries = new Map<Element, Query>();
    private readonly sources = new Map<Element, Source>();
    private readonly sourceStatuses = new Map<Element, SourceStatusValue>();
    private readonly syncControls = new Map<Element, SyncControl>();
    constructor(
        private readonly root: Element,
        private readonly filters: FilterMap,
        private readonly afterSourceRender: (source: Element) => void,
    ) {}

    get sourceCount(): number {
        return this.queries.size + this.sources.size;
    }

    teardown(hooks?: { beforeSourceDispose?: (source: Source | Query) => void }): void {
        for (const query of this.queries.values()) {
            hooks?.beforeSourceDispose?.(query);
            query.dispose();
        }
        for (const source of this.sources.values()) {
            hooks?.beforeSourceDispose?.(source);
            source.dispose();
        }
        for (const sync of this.syncControls.values()) {
            sync.dispose();
        }
        this.queries.clear();
        this.sources.clear();
        this.sourceStatuses.clear();
        this.syncControls.clear();
    }

    reconcileQuery(element: Element): void {
        if (!element.hasAttribute(QUERY_ATTR)) {
            this.unregisterQuery(element);
            return;
        }
        if (!this.queries.has(element)) {
            this.registerQuery(element);
        }
    }

    registerQuery(element: Element): void {
        if (!element.isConnected || this.queries.has(element)) {
            return;
        }
        const query = new Query(element, this.filters, { afterRender: this.afterSourceRender });
        this.queries.set(element, query);
        query.start();
    }

    unregisterQuery(element: Element): void {
        const query = this.queries.get(element);
        if (!query) {
            return;
        }
        if (!element.isConnected) {
            query.renderTemplate();
        }
        query.dispose();
        this.queries.delete(element);
    }

    reconcileSource(element: Element): void {
        if (!element.hasAttribute(SOURCE_ATTR) || element.localName !== "form") {
            this.unregisterSource(element);
            return;
        }
        if (!this.sources.has(element)) {
            this.registerSource(element);
        }
    }

    registerSource(element: Element): void {
        const Form = element.ownerDocument.defaultView?.HTMLFormElement ?? globalThis.HTMLFormElement;
        if (
            !element.isConnected ||
            this.sources.has(element) ||
            typeof Form !== "function" ||
            !(element instanceof Form)
        ) {
            return;
        }
        const source = new Source(element as HTMLFormElement, this.filters, {
            setSourceStatus: (current, status) => this.sourceStatuses.set(current, status),
            sourceStatusesFor: (current, status) => sourceStatusScope(this.root, this.sourceStatuses, current, status),
            afterSourceRender: this.afterSourceRender,
        });
        this.sources.set(element, source);
        source.start();
    }

    unregisterSource(element: Element): void {
        const source = this.sources.get(element);
        if (!source) {
            return;
        }
        if (!element.isConnected) {
            source.renderTemplate();
        }
        source.dispose();
        this.sources.delete(element);
        this.sourceStatuses.delete(element);
    }

    registerSyncControl(element: Element): void {
        if (!element.isConnected || this.syncControls.has(element)) {
            return;
        }
        const sync = new SyncControl(element);
        this.syncControls.set(element, sync);
        sync.start();
    }

    unregisterSyncControl(element: Element): void {
        const sync = this.syncControls.get(element);
        if (!sync) {
            return;
        }
        sync.dispose();
        this.syncControls.delete(element);
    }

    pruneDetached(): void {
        for (const query of this.queries.keys()) {
            if (!query.isConnected) {
                this.unregisterQuery(query);
            }
        }
        for (const source of this.sources.keys()) {
            if (!source.isConnected) {
                this.unregisterSource(source);
            }
        }
        for (const sync of this.syncControls.keys()) {
            if (!sync.isConnected) {
                this.unregisterSyncControl(sync);
            }
        }
    }

    isInScope(element: Element): boolean {
        if (element !== this.root && !this.root.contains(element)) {
            return false;
        }
        for (let parent = element.parentElement; parent && parent !== this.root; parent = parent.parentElement) {
            if (parent.localName === BINDING_CORE_TAG) {
                return false;
            }
        }
        return true;
    }
}
