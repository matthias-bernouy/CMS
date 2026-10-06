/** Discovers binding features and owns their lifecycle for one root. */

import { SOURCE_ATTR, type SourceState } from "../core/attrs";
import type { FilterMap } from "../core/interpolate";
import { PAGE_STATE_ATTR } from "../params/PageStateSync";
import { PARAM_SYNC_ATTR } from "../params/ParamSync";
import type { Source } from "../source/Source";
import { reconcileAttribute, registerWithin, unregisterWithin } from "./BindingDiscovery";
import { BindingRegistry } from "./BindingRegistry";
import { FixedRangeRuntime } from "./FixedRangeRuntime";
import { revealInertSources, revealSources } from "./revealSources";
export { revealSources } from "./revealSources";

export class BindingRuntime {
    private readonly registry: BindingRegistry;
    private readonly fixedRanges: FixedRangeRuntime;
    private observer: MutationObserver | null = null;
    private stopped = false;

    constructor(
        private readonly root: Element,
        filters: FilterMap = {},
        options: { sourceStateForce?: SourceState } = {},
    ) {
        this.registry = new BindingRegistry(root, filters, options, (source) => this.afterSourceRender(source));
        this.fixedRanges = new FixedRangeRuntime(root, filters);
    }

    start(): void {
        if (typeof document !== "undefined" && document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => this.activate(), { once: true });
        } else {
            this.activate();
        }
    }

    stop(): void {
        this.teardown({ beforeSourceDispose: (source) => source.renderTemplate() });
    }

    deactivate(): void {
        this.teardown({
            beforeSourceDispose: (source) => source.renderTemplate(),
            afterDispose: () => revealSources(this.root),
        });
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
        revealInertSources(this.root);
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
                    revealInertSources(node);
                    this.fixedRanges.mountWithin(node);
                    registerWithin(node, this.root, this.registry);
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

    private teardown(hooks?: { beforeSourceDispose?: (source: Source) => void; afterDispose?: () => void }): void {
        if (this.stopped) {
            return;
        }
        this.stopped = true;
        this.observer?.disconnect();
        this.observer = null;
        this.registry.teardown(hooks);
        this.fixedRanges.restore();
        hooks?.afterDispose?.();
    }

    private afterSourceRender(source: Element): void {
        if (this.stopped) {
            return;
        }
        this.registry.pruneDetached();
        if (source.isConnected) {
            registerWithin(source, this.root, this.registry);
        }
    }
}
