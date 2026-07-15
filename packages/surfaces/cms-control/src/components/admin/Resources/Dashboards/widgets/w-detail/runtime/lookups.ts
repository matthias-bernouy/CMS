import { detailData, type DetailOptions } from "../../../runtime/mapping";
import { isLookupField, loadDetailLookupOptions } from "../../../runtime/lookups";
import type { WDetailData } from "../types";
import { DetailFieldState, parseJson, type DetailWidget } from "./fieldState";
import { DetailRequestCoordinator, type DetailRequestConsumer } from "./requests";

type LookupCallbacks = {
    setData(value: WDetailData): void;
    render(): void;
    isConnected(): boolean;
};
type FieldLoad = {
    failed: boolean;
    fieldId: string;
    generation: number;
    options: DetailOptions[string];
};
export class DetailLookups {
    private currentOptions: DetailOptions = {};
    private scopeKey = "";
    private scopeGeneration = 0;
    private reloadTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly pendingFieldIds = new Set<string>();
    private readonly consumers = new Map<string, DetailRequestConsumer>();
    private readonly fieldGenerations = new Map<string, number>();

    constructor(
        private readonly dataset: DOMStringMap,
        private readonly fields: DetailFieldState,
        private readonly requests: DetailRequestCoordinator,
        private readonly callbacks: LookupCallbacks,
    ) {}

    get options(): DetailOptions {
        return this.currentOptions;
    }

    syncScope(scopeKey: string): void {
        if (this.scopeKey === scopeKey) return;
        this.clear();
        this.scopeKey = scopeKey;
        this.currentOptions = {};
    }

    async load(
        widget: DetailWidget,
        resource: unknown,
        rowKey: string,
        sourceId: string,
        fields: Record<string, unknown>,
        loadOptions: { fieldIds?: ReadonlySet<string>; useLatestFields?: boolean } = {},
    ): Promise<void> {
        if (!loadOptions.fieldIds) this.clearPendingRefresh();
        const fieldIds = loadOptions.fieldIds ?? allLookupFieldIds(widget);
        const scopeGeneration = this.scopeGeneration;
        const results = await Promise.all([...fieldIds].map(fieldId => (
            this.loadField(widget, resource, sourceId, fields, fieldId)
        )));
        if (this.scopeGeneration !== scopeGeneration) return;

        const next = { ...this.currentOptions };
        let accepted = false;
        for (const result of results) {
            if (this.fieldGenerations.get(result.fieldId) !== result.generation) continue;
            if (result.failed && Object.hasOwn(this.currentOptions, result.fieldId)) continue;
            next[result.fieldId] = result.options;
            accepted = true;
        }
        if (!accepted) return;

        const renderFields = loadOptions.useLatestFields ? this.fields.currentFields() : fields;
        this.currentOptions = next;
        this.callbacks.setData(detailData(widget, resource, rowKey, renderFields, next, sourceId));
        if (this.callbacks.isConnected()) this.callbacks.render();
    }

    schedule(changedFieldId: string): void {
        const widget = parseJson<DetailWidget>(this.dataset.configJson ?? "");
        if (!widget || widget.widget !== "w-detail") return;
        const fieldIds = lookupFieldIdsDependingOn(widget, changedFieldId);
        if (fieldIds.size === 0) return;
        for (const fieldId of fieldIds) {
            this.pendingFieldIds.add(fieldId);
            this.invalidateField(fieldId);
        }
        this.cancelReloadTimer();
        this.reloadTimer = setTimeout(() => {
            this.reloadTimer = null;
            const targetedFieldIds = new Set(this.pendingFieldIds);
            this.pendingFieldIds.clear();
            const resource = this.fields.currentResource();
            const sourceId = this.dataset.sourceId ?? "";
            if (!sourceId || resource === undefined) return;
            void this.load(widget, resource, this.dataset.rowKey ?? "", sourceId, this.fields.currentFields(), {
                fieldIds: targetedFieldIds,
                useLatestFields: true,
            });
        }, 250);
    }

    clear(): void {
        this.scopeGeneration += 1;
        for (const consumer of this.consumers.values()) this.requests.cancel(consumer);
        this.consumers.clear();
        this.fieldGenerations.clear();
        this.clearPendingRefresh();
    }

    private async loadField(
        widget: DetailWidget,
        resource: unknown,
        sourceId: string,
        fields: Record<string, unknown>,
        fieldId: string,
    ): Promise<FieldLoad> {
        const consumer = this.consumer(fieldId);
        const generation = this.invalidateField(fieldId);
        try {
            const result = await loadDetailLookupOptions(sourceId, widget, resource, fields, {
                fieldIds: new Set([fieldId]),
                loadData: (targetSourceId, ref, vars) => this.requests.load(consumer, targetSourceId, ref, vars),
            });
            return {
                failed: result.failedFieldIds.has(fieldId),
                fieldId,
                generation,
                options: result.options[fieldId] ?? [],
            };
        } catch {
            return { failed: true, fieldId, generation, options: [] };
        }
    }

    private consumer(fieldId: string): DetailRequestConsumer {
        const existing = this.consumers.get(fieldId);
        if (existing) return existing;
        const consumer = this.requests.createConsumer();
        this.consumers.set(fieldId, consumer);
        return consumer;
    }

    private invalidateField(fieldId: string): number {
        const generation = (this.fieldGenerations.get(fieldId) ?? 0) + 1;
        this.fieldGenerations.set(fieldId, generation);
        const consumer = this.consumers.get(fieldId);
        if (consumer) this.requests.cancel(consumer);
        return generation;
    }

    private clearPendingRefresh(): void {
        this.pendingFieldIds.clear();
        this.cancelReloadTimer();
    }

    private cancelReloadTimer(): void {
        if (this.reloadTimer) clearTimeout(this.reloadTimer);
        this.reloadTimer = null;
    }
}

function lookupFields(widget: DetailWidget) {
    return [...widget.main, ...(widget.aside ?? [])].flatMap(section => section.fields)
        .filter(isLookupField);
}

function allLookupFieldIds(widget: DetailWidget): Set<string> {
    return new Set(lookupFields(widget).map(field => field.id));
}

function lookupFieldIdsDependingOn(widget: DetailWidget, changedFieldId: string): Set<string> {
    const fieldIds = new Set<string>();
    if (!changedFieldId) return fieldIds;
    for (const field of lookupFields(widget)) {
        const depends = Object.values(field.lookup?.params ?? {}).some(expression => (
            expression === `$field.${changedFieldId}` || expression.startsWith(`$field.${changedFieldId}.`)
        ));
        if (depends) fieldIds.add(field.id);
    }
    return fieldIds;
}
