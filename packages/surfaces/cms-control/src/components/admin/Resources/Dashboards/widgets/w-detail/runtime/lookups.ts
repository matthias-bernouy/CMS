import { detailData, type DetailOptions, type DetailSchemas } from "../../../runtime/mapping";
import {
    allLookupTargetKeys,
    loadDetailLookupOptions,
    lookupTargetKeysDependingOn,
} from "../../../runtime/lookups";
import type { WDetailData } from "../types";
import { DetailFieldState, readDetailBinding, type DetailWidget } from "./fieldState";
import { DetailRequestCoordinator, DetailRequestTargets } from "./requests";

type LookupCallbacks = {
    setData(value: WDetailData): void;
    render(): void;
    isConnected(): boolean;
    schemas(): DetailSchemas;
};
type TargetLoad = {
    failed: boolean;
    key: string;
    generation: number;
    options: DetailOptions[string];
};
export class DetailLookups {
    private currentOptions: DetailOptions = {};
    private scopeKey = "";
    private scopeGeneration = 0;
    private reloadTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly pendingTargetKeys = new Set<string>();
    private readonly targets: DetailRequestTargets;

    constructor(
        private readonly dataset: DOMStringMap,
        private readonly fields: DetailFieldState,
        private readonly requests: DetailRequestCoordinator,
        private readonly callbacks: LookupCallbacks,
    ) {
        this.targets = new DetailRequestTargets(requests);
    }

    get options(): DetailOptions {
        return this.currentOptions;
    }

    syncScope(scopeKey: string): void {
        if (this.scopeKey === scopeKey) return;
        this.clear();
        this.scopeKey = scopeKey;
    }

    async load(
        widget: DetailWidget,
        resource: unknown,
        rowKey: string,
        sourceId: string,
        fields: Record<string, unknown>,
        loadOptions: { targetKeys?: ReadonlySet<string>; useLatestFields?: boolean } = {},
    ): Promise<void> {
        if (!loadOptions.targetKeys) this.clearPendingRefresh();
        const targetKeys = loadOptions.targetKeys ?? allLookupTargetKeys(widget);
        const scopeGeneration = this.scopeGeneration;
        const results = await Promise.all([...targetKeys].map(key => (
            this.loadTarget(widget, resource, sourceId, fields, key)
        )));
        if (this.scopeGeneration !== scopeGeneration) return;

        const next = { ...this.currentOptions };
        let accepted = false;
        for (const result of results) {
            if (!this.targets.isCurrent(result.key, result.generation)) continue;
            if (result.failed && Object.hasOwn(this.currentOptions, result.key)) continue;
            next[result.key] = result.options;
            accepted = true;
        }
        if (!accepted) return;

        const renderFields = loadOptions.useLatestFields ? this.fields.currentFields() : fields;
        this.currentOptions = next;
        this.callbacks.setData(detailData(
            widget,
            resource,
            rowKey,
            renderFields,
            next,
            sourceId,
            this.callbacks.schemas(),
        ));
        if (this.callbacks.isConnected()) this.callbacks.render();
    }

    schedule(changedFieldId: string): void {
        const binding = readDetailBinding(this.dataset);
        if (!binding) return;
        const targetKeys = lookupTargetKeysDependingOn(binding.widget, changedFieldId);
        if (targetKeys.size === 0) return;
        for (const key of targetKeys) {
            this.pendingTargetKeys.add(key);
            this.invalidateTarget(key);
        }
        this.cancelReloadTimer();
        this.reloadTimer = setTimeout(() => {
            this.reloadTimer = null;
            const targetedKeys = new Set(this.pendingTargetKeys);
            this.pendingTargetKeys.clear();
            const latest = readDetailBinding(this.dataset);
            if (!latest?.sourceId) return;
            void this.load(latest.widget, latest.resource, latest.rowKey, latest.sourceId, this.fields.currentFields(), {
                targetKeys: targetedKeys,
                useLatestFields: true,
            });
        }, 250);
    }

    clear(): void {
        this.scopeGeneration += 1;
        this.targets.clear();
        this.clearPendingRefresh();
        this.currentOptions = {};
    }

    private async loadTarget(
        widget: DetailWidget,
        resource: unknown,
        sourceId: string,
        fields: Record<string, unknown>,
        key: string,
    ): Promise<TargetLoad> {
        const consumer = this.targets.consumer(key);
        const generation = this.targets.invalidate(key);
        try {
            const result = await loadDetailLookupOptions(sourceId, widget, resource, fields, {
                targetKeys: new Set([key]),
                loadData: (targetSourceId, ref, vars) => this.requests.load(consumer, targetSourceId, ref, vars),
            });
            return {
                failed: result.failedTargetKeys.has(key),
                key,
                generation,
                options: result.options[key] ?? [],
            };
        } catch {
            return { failed: true, key, generation, options: [] };
        }
    }

    private invalidateTarget(key: string): number {
        return this.targets.invalidate(key);
    }

    private clearPendingRefresh(): void {
        this.pendingTargetKeys.clear();
        this.cancelReloadTimer();
    }

    private cancelReloadTimer(): void {
        if (this.reloadTimer) clearTimeout(this.reloadTimer);
        this.reloadTimer = null;
    }
}
