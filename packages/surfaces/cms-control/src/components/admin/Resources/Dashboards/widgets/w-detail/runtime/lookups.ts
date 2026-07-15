import { detailData, type DetailOptions } from "../../../runtime/mapping";
import { detailLookupOptions } from "../../../runtime/lookups";
import type { WDetailData } from "../types";
import { DetailFieldState, parseJson, type DetailWidget } from "./fieldState";

type LookupCallbacks = {
    setData(value: WDetailData): void;
    render(): void;
    isConnected(): boolean;
};

export class DetailLookups {
    private currentOptions: DetailOptions = {};
    private requestKey = "";
    private scopeKey = "";
    private reloadTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(
        private readonly dataset: DOMStringMap,
        private readonly fields: DetailFieldState,
        private readonly callbacks: LookupCallbacks,
    ) {}

    get options(): DetailOptions {
        return this.currentOptions;
    }

    syncScope(scopeKey: string): void {
        if (this.scopeKey === scopeKey) return;
        this.scopeKey = scopeKey;
        this.currentOptions = {};
    }

    async load(
        widget: DetailWidget,
        resource: unknown,
        rowKey: string,
        sourceId: string,
        fields: Record<string, unknown>,
        loadOptions: { useLatestFields?: boolean } = {},
    ): Promise<void> {
        const requestKey = `${sourceId}:${widget.id}:${rowKey}:${this.dataset.sourceJson ?? ""}:${lookupFieldsKey(fields)}`;
        this.requestKey = requestKey;
        try {
            const options = await detailLookupOptions(sourceId, widget, resource, fields);
            if (this.requestKey !== requestKey) return;
            const renderFields = loadOptions.useLatestFields ? this.fields.currentFields() : fields;
            this.currentOptions = options;
            this.callbacks.setData(detailData(widget, resource, rowKey, renderFields, options, sourceId));
            if (this.callbacks.isConnected()) this.callbacks.render();
        } catch {
            if (this.requestKey === requestKey) this.currentOptions = {};
        }
    }

    schedule(changedFieldId: string): void {
        const widget = parseJson<DetailWidget>(this.dataset.configJson ?? "");
        if (!widget || widget.widget !== "w-detail" || !lookupDependsOnField(widget, changedFieldId)) return;
        const fields = this.fields.currentFields();
        this.clear();
        this.reloadTimer = setTimeout(() => {
            this.reloadTimer = null;
            const resource = this.fields.currentResource();
            const sourceId = this.dataset.sourceId ?? "";
            if (!sourceId || resource === undefined) return;
            void this.load(widget, resource, this.dataset.rowKey ?? "", sourceId, fields);
        }, 250);
    }

    clear(): void {
        if (!this.reloadTimer) return;
        clearTimeout(this.reloadTimer);
        this.reloadTimer = null;
    }
}

function lookupFieldsKey(fields: Record<string, unknown>): string {
    try {
        return JSON.stringify(fields);
    } catch {
        return String(Object.keys(fields).sort().length);
    }
}

function lookupDependsOnField(widget: DetailWidget, fieldId: string): boolean {
    if (!fieldId) return false;
    return [...widget.main, ...(widget.aside ?? [])]
        .flatMap(section => section.fields)
        .some(field => {
            if ((field.type !== "combobox" && field.type !== "tokens") || !field.lookup) return false;
            return [
                ...Object.values(field.lookup.params ?? {}),
                ...Object.values(field.lookup.selected?.params ?? {}),
            ].some(expression => expression === `$field.${fieldId}`
                || (expression as string).startsWith(`$field.${fieldId}.`));
        });
}
