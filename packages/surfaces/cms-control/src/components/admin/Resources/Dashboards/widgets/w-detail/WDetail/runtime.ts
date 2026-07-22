import { detailData } from "../../../runtime/mapping";
import { DetailView } from "../runtime/detailView";
import { DetailEvents } from "../runtime/events";
import { DetailFieldState, type DetailWidget } from "../runtime/fieldState";
import { DetailLookups } from "../runtime/lookups";
import { DetailRequestCoordinator } from "../runtime/requests";
import { DetailSchemasState } from "../runtime/schemas";
import type { WDetailData } from "../types";

export type DetailRuntime = {
    events: DetailEvents;
    fields: DetailFieldState;
    lookups: DetailLookups;
    requests: DetailRequestCoordinator;
    schemas: DetailSchemasState;
    view: DetailView;
};

export class DetailSyncScheduler {
    private lifecycleRevision = 0;
    private scheduled = false;

    advanceLifecycle(): void {
        this.lifecycleRevision += 1;
        this.scheduled = false;
    }

    schedule(isConnected: () => boolean, isBound: () => boolean, invalidate: () => void, sync: () => void): void {
        if (!isConnected()) {
            return;
        }
        invalidate();
        if (this.scheduled) {
            return;
        }
        this.scheduled = true;
        const lifecycleRevision = this.lifecycleRevision;
        queueMicrotask(() => {
            if (this.lifecycleRevision !== lifecycleRevision || !isBound()) {
                return;
            }
            this.scheduled = false;
            if (isConnected()) {
                sync();
            }
        });
    }
}

type DetailRuntimeCallbacks = {
    data(): WDetailData;
    isBound(): boolean;
    isConnected(): boolean;
    refreshConditionalFields(): void;
    render(): void;
    setData(value: WDetailData): void;
};

export function createDetailRuntime(
    host: HTMLElement,
    root: ShadowRoot,
    callbacks: DetailRuntimeCallbacks,
): DetailRuntime {
    const fields = new DetailFieldState(root, host.dataset, callbacks.data);
    const view = new DetailView(root);
    const requests = new DetailRequestCoordinator();
    let schemas: DetailSchemasState;
    const lookups = new DetailLookups(host.dataset, fields, requests, {
        setData: callbacks.setData,
        render: callbacks.render,
        isConnected: callbacks.isConnected,
        schemas: () => schemas.values,
    });
    schemas = new DetailSchemasState(host.dataset, fields, requests, {
        setData: callbacks.setData,
        render: callbacks.render,
        isConnected: callbacks.isConnected,
        options: () => lookups.options,
    });
    const events = new DetailEvents(
        host,
        root,
        fields,
        lookups,
        schemas,
        callbacks.isBound,
        callbacks.data,
        callbacks.refreshConditionalFields,
    );
    return { events, fields, lookups, requests, schemas, view };
}

export function mapDetailData(
    runtime: DetailRuntime,
    widget: DetailWidget,
    resource: unknown,
    rowKey: string,
    fields: Record<string, unknown>,
    sourceId: string,
): WDetailData {
    return detailData(widget, resource, rowKey, fields, runtime.lookups.options, sourceId, runtime.schemas.values);
}
