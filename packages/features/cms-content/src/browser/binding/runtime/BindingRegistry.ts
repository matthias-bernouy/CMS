import { BINDING_CORE_TAG, MUTATION_ATTR, QUERIES_ATTR, QUERY_ATTR } from "../core/attrs";
import type { FilterMap } from "../core/interpolate";
import { SyncControl } from "../state/SyncControl";
import { Query } from "./query/Query";
import { FormMutation } from "./mutation/FormMutation";

export class BindingRegistry {
    private readonly queries = new Map<Element, Query>();
    private readonly mutations = new Map<Element, FormMutation>();
    private readonly syncControls = new Map<Element, SyncControl>();
    constructor(
        private readonly root: Element,
        private readonly filters: FilterMap,
        private readonly afterRender: (source: Element) => void,
    ) {}

    get sourceCount(): number {
        return this.queries.size + this.mutations.size;
    }

    teardown(hooks?: { beforeBindingDispose?: (binding: FormMutation | Query) => void }): void {
        for (const query of this.queries.values()) {
            hooks?.beforeBindingDispose?.(query);
            query.dispose();
        }
        for (const mutation of this.mutations.values()) {
            hooks?.beforeBindingDispose?.(mutation);
            mutation.dispose();
        }
        for (const sync of this.syncControls.values()) {
            sync.dispose();
        }
        this.queries.clear();
        this.mutations.clear();
        this.syncControls.clear();
    }

    reconcileQuery(element: Element): void {
        if (!element.hasAttribute(QUERY_ATTR) && !element.hasAttribute(QUERIES_ATTR)) {
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
        const query = new Query(element, this.filters, { afterRender: this.afterRender });
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
        if (!element.hasAttribute(MUTATION_ATTR) || element.localName !== "form") {
            this.unregisterSource(element);
            return;
        }
        if (!this.mutations.has(element)) {
            this.registerSource(element);
        }
    }

    registerSource(element: Element): void {
        const Form = element.ownerDocument.defaultView?.HTMLFormElement ?? globalThis.HTMLFormElement;
        if (
            !element.isConnected ||
            this.mutations.has(element) ||
            typeof Form !== "function" ||
            !(element instanceof Form)
        ) {
            return;
        }
        const mutation = new FormMutation(element as HTMLFormElement, this.filters, {
            afterMutationRender: this.afterRender,
        });
        this.mutations.set(element, mutation);
        mutation.start();
    }

    unregisterSource(element: Element): void {
        const mutation = this.mutations.get(element);
        if (!mutation) {
            return;
        }
        if (!element.isConnected) {
            mutation.renderTemplate();
        }
        mutation.dispose();
        this.mutations.delete(element);
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
        for (const mutation of this.mutations.keys()) {
            if (!mutation.isConnected) {
                this.unregisterSource(mutation);
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
