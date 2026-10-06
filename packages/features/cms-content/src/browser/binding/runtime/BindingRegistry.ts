import { BIND_STOP_ATTR, BINDING_CORE_TAG, SOURCE_ATTR, type SourceState } from "../core/attrs";
import type { FilterMap } from "../core/interpolate";
import { PageStateSync } from "../params/PageStateSync";
import { ParamSync } from "../params/ParamSync";
import { Source } from "../source/Source";
import { sourceTrigger } from "../source/sourceEvents";
import type { SourceStatusValue } from "../source/presentation/sourceStatus";
import { hasLocalSourceData } from "../source/values";
import { sourceUrl } from "../source/runtime/sourceSpec";
import { sourceStatusScope } from "./sourceStatusScope";
import { ReadRequests } from "../source/runtime/readRequests";

export class BindingRegistry {
    private readonly sources = new Map<Element, Source>();
    private readonly sourceStatuses = new Map<Element, SourceStatusValue>();
    private readonly paramSyncs = new Map<Element, ParamSync>();
    private readonly pageStateSyncs = new Map<Element, PageStateSync>();
    private readonly reads: ReadRequests;

    constructor(
        private readonly root: Element,
        private readonly filters: FilterMap,
        private readonly options: { sourceStateForce?: SourceState },
        private readonly afterSourceRender: (source: Element) => void,
    ) {
        this.reads = new ReadRequests(root.ownerDocument);
    }

    get sourceCount(): number {
        return this.sources.size;
    }

    teardown(hooks?: { beforeSourceDispose?: (source: Source) => void }): void {
        for (const source of this.sources.values()) {
            hooks?.beforeSourceDispose?.(source);
            source.dispose();
        }
        for (const sync of this.paramSyncs.values()) {
            sync.dispose();
        }
        for (const sync of this.pageStateSyncs.values()) {
            sync.dispose();
        }
        this.sources.clear();
        this.sourceStatuses.clear();
        this.paramSyncs.clear();
        this.pageStateSyncs.clear();
    }

    reconcileSource(element: Element): void {
        if (!element.hasAttribute(SOURCE_ATTR) || !this.hasSourceInput(element)) {
            this.unregisterSource(element);
            return;
        }
        const existing = this.sources.get(element);
        if (existing) {
            if (sourceTrigger(element) === "auto") {
                void existing.run({ onlyIfUrlChanged: true });
            }
        } else {
            this.registerSource(element);
        }
    }

    registerSource(element: Element): void {
        if (!element.isConnected || this.sources.has(element) || !this.hasSourceInput(element)) {
            return;
        }
        const source = new Source(element, this.filters, {
            ...this.options,
            read: this.reads.read,
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

    registerParamSync(element: Element): void {
        if (!element.isConnected || this.paramSyncs.has(element)) {
            return;
        }
        const sync = new ParamSync(element);
        this.paramSyncs.set(element, sync);
        sync.start();
    }

    unregisterParamSync(element: Element): void {
        const sync = this.paramSyncs.get(element);
        if (!sync) {
            return;
        }
        sync.dispose();
        this.paramSyncs.delete(element);
    }

    registerPageStateSync(element: Element): void {
        if (!element.isConnected || this.pageStateSyncs.has(element)) {
            return;
        }
        const sync = new PageStateSync(element);
        this.pageStateSyncs.set(element, sync);
        sync.start();
    }

    unregisterPageStateSync(element: Element): void {
        const sync = this.pageStateSyncs.get(element);
        if (!sync) {
            return;
        }
        sync.dispose();
        this.pageStateSyncs.delete(element);
    }

    pruneDetached(): void {
        for (const source of this.sources.keys()) {
            if (!source.isConnected) {
                this.unregisterSource(source);
            }
        }
        for (const sync of this.paramSyncs.keys()) {
            if (!sync.isConnected) {
                this.unregisterParamSync(sync);
            }
        }
        for (const sync of this.pageStateSyncs.keys()) {
            if (!sync.isConnected) {
                this.unregisterPageStateSync(sync);
            }
        }
    }

    isInScope(element: Element): boolean {
        if (element !== this.root && !this.root.contains(element)) {
            return false;
        }
        for (let parent = element.parentElement; parent && parent !== this.root; parent = parent.parentElement) {
            if (parent.localName === BINDING_CORE_TAG || parent.hasAttribute(BIND_STOP_ATTR)) {
                return false;
            }
        }
        return true;
    }

    private hasSourceInput(element: Element): boolean {
        return (
            sourceUrl(element.getAttribute(SOURCE_ATTR) ?? "").trim() !== "" ||
            (sourceTrigger(element) === "auto" && hasLocalSourceData(element))
        );
    }
}
