import type { DashboardField } from "@bernouy/cms-dashboards";
import { detailData, type DetailOptions, type DetailSchemas } from "../../../../runtime/mapping";
import type { WDetailData, WDetailSchemaDefinition } from "../../types";
import { DetailFieldState, readDetailBinding, type DetailWidget } from "../fieldState";
import { DetailRequestCoordinator, DetailRequestTargets } from "../requests";
import { definitionsAt } from "./definitions";
import { schemaFields, schemaKeysDependingOn } from "./dependencies";

type SchemaCallbacks = {
    setData(value: WDetailData): void;
    render(): void;
    isConnected(): boolean;
    options(): DetailOptions;
};
type SchemaLoad = {
    definitions: WDetailSchemaDefinition[];
    failed: boolean;
    generation: number;
    key: string;
};

export class DetailSchemasState {
    private current: DetailSchemas = {};
    private scopeGeneration = 0;
    private scopeKey = "";
    private reloadTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly pendingKeys = new Set<string>();
    private readonly targets: DetailRequestTargets;

    constructor(
        private readonly dataset: DOMStringMap,
        private readonly fields: DetailFieldState,
        private readonly requests: DetailRequestCoordinator,
        private readonly callbacks: SchemaCallbacks,
    ) {
        this.targets = new DetailRequestTargets(requests);
    }

    get values(): DetailSchemas {
        return this.current;
    }

    syncScope(scopeKey: string): void {
        if (this.scopeKey === scopeKey) {
            return;
        }
        this.clear();
        this.scopeKey = scopeKey;
    }

    async load(
        widget: DetailWidget,
        resource: unknown,
        rowKey: string,
        sourceId: string,
        fields: Record<string, unknown>,
        options: { keys?: ReadonlySet<string>; useLatestFields?: boolean } = {},
    ): Promise<void> {
        const configured = schemaFields(widget).filter((field) => !options.keys || options.keys.has(field.id));
        const scopeGeneration = this.scopeGeneration;
        const results = await Promise.all(configured.map((field) => this.loadField(field, resource, sourceId, fields)));
        if (this.scopeGeneration !== scopeGeneration) {
            return;
        }
        const next = { ...this.current };
        for (const result of results) {
            if (!this.targets.isCurrent(result.key, result.generation)) {
                continue;
            }
            next[result.key] = result.failed
                ? { definitions: this.current[result.key]?.definitions ?? [], status: "error" }
                : { definitions: result.definitions, status: "ready" };
        }
        if (results.length === 0) {
            return;
        }
        this.current = next;
        const renderFields = options.useLatestFields ? this.fields.currentFields() : fields;
        this.callbacks.setData(
            detailData(widget, resource, rowKey, renderFields, this.callbacks.options(), sourceId, next),
        );
        if (this.callbacks.isConnected()) {
            this.callbacks.render();
        }
    }

    schedule(changedFieldId: string): void {
        const binding = readDetailBinding(this.dataset);
        if (!binding) {
            return;
        }
        const { widget, resource, rowKey, sourceId } = binding;
        const keys = schemaKeysDependingOn(widget, changedFieldId);
        if (keys.size === 0) {
            return;
        }
        if (!sourceId) {
            return;
        }
        for (const key of keys) {
            this.pendingKeys.add(key);
            this.invalidate(key);
        }
        const fields = this.fields.currentFields();
        this.current = Object.fromEntries(
            Object.entries(this.current).map(([key, schema]) => [
                key,
                keys.has(key) ? { ...schema, status: "loading" as const } : schema,
            ]),
        );
        this.callbacks.setData(
            detailData(widget, resource, rowKey, fields, this.callbacks.options(), sourceId, this.current),
        );
        this.cancelTimer();
        this.reloadTimer = setTimeout(() => {
            this.reloadTimer = null;
            const pending = new Set(this.pendingKeys);
            this.pendingKeys.clear();
            if (this.callbacks.isConnected()) {
                this.callbacks.render();
            }
            const latest = readDetailBinding(this.dataset);
            if (!latest?.sourceId) {
                return;
            }
            void this.load(
                latest.widget,
                latest.resource,
                latest.rowKey,
                latest.sourceId,
                this.fields.currentFields(),
                {
                    keys: pending,
                    useLatestFields: true,
                },
            );
        }, 250);
    }

    clear(): void {
        this.scopeGeneration += 1;
        this.targets.clear();
        this.pendingKeys.clear();
        this.cancelTimer();
        this.current = {};
    }

    private async loadField(
        field: Extract<DashboardField, { type: "schema" }>,
        resource: unknown,
        sourceId: string,
        fields: Record<string, unknown>,
    ): Promise<SchemaLoad> {
        const consumer = this.targets.consumer(field.id);
        const generation = this.targets.invalidate(field.id);
        try {
            const data = await this.requests.load(consumer, sourceId, field.schema, { resource, fields });
            return {
                definitions: definitionsAt(data, field.schema.itemsPath),
                failed: false,
                generation,
                key: field.id,
            };
        } catch {
            return { definitions: [], failed: true, generation, key: field.id };
        }
    }

    private invalidate(key: string): number {
        return this.targets.invalidate(key);
    }

    private cancelTimer(): void {
        if (this.reloadTimer) {
            clearTimeout(this.reloadTimer);
        }
        this.reloadTimer = null;
    }
}
