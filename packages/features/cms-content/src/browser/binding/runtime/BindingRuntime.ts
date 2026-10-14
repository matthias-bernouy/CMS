/** Discovers binding features and owns their lifecycle for one root. */

import { QUERIES_ATTR, QUERY_ATTR, SOURCE_ATTR, SYNC_ATTR } from "../core/attrs";
import type { FilterMap } from "../core/interpolate";
import type { FormMutation } from "./mutation/FormMutation";
import type { Query } from "./query/Query";
import { reconcileAttribute, registerWithin, unregisterWithin } from "./BindingDiscovery";
import { BindingRegistry } from "./BindingRegistry";
import { FixedRangeRuntime } from "./FixedRangeRuntime";

export class BindingRuntime {
    private readonly registry: BindingRegistry;
    private readonly fixedRanges: FixedRangeRuntime;
    private observer: MutationObserver | null = null;
    private stopped = false;

    constructor(
        private readonly root: Element,
        filters: FilterMap = {},
    ) {
        this.registry = new BindingRegistry(root, filters, (source) => this.afterRender(source));
        this.fixedRanges = new FixedRangeRuntime(root, filters);
    }

    start(): void {
        this.activate();
    }

    stop(): void {
        this.teardown({ beforeBindingDispose: (binding) => binding.renderTemplate() });
    }

    get isStopped(): boolean {
        return this.stopped;
    }

    get size(): number {
        return this.registry.sourceCount;
    }

    private activate(): void {
        if (this.stopped) {
            return;
        }
        this.fixedRanges.mountWithin(this.root);
        registerWithin(this.root, this.root, this.registry);
        const Observer = this.root.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
        this.observer = new Observer((records) => {
            for (const record of records) {
                if (record.type === "attributes") {
                    reconcileAttribute(record.target, record.attributeName, this.registry);
                    continue;
                }
                record.removedNodes.forEach((node) => unregisterWithin(node, this.root, this.registry));
                record.addedNodes.forEach((node) => {
                    this.fixedRanges.mountWithin(node);
                    registerWithin(node, this.root, this.registry);
                });
            }
        });
        this.observer.observe(this.root, {
            attributes: true,
            attributeFilter: [QUERY_ATTR, QUERIES_ATTR, SOURCE_ATTR, SYNC_ATTR],
            childList: true,
            subtree: true,
        });
    }

    private teardown(hooks?: { beforeBindingDispose?: (binding: FormMutation | Query) => void }): void {
        if (this.stopped) {
            return;
        }
        this.stopped = true;
        this.observer?.disconnect();
        this.observer = null;
        this.registry.teardown(hooks);
        this.fixedRanges.restore();
    }

    private afterRender(source: Element): void {
        if (this.stopped) {
            return;
        }
        this.registry.pruneDetached();
        if (source.isConnected) {
            registerWithin(source, this.root, this.registry);
        }
    }
}
