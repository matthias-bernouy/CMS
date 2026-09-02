import { detailData, type DetailOptions, type DetailSchemas } from "../../../../runtime/mapping";
import {
    allLookupTargetKeys,
    cmsUserTarget,
    detailLookupTargets,
    loadDetailLookupOptions,
    lookupTargetKeysDependingOn,
    type DetailLookupPage,
} from "../../../../runtime/lookups";
import { dashboardUserOptions, fetchDashboardUsers } from "../../../../api";
import { matchesDashboardVisibility } from "../../../../runtime/expressions";
import type { WDetailData, WDetailField } from "../../types";
import { DetailFieldState, readDetailBinding, type DetailWidget } from "../fieldState";
import { DetailRequestCoordinator, DetailRequestTargets } from "../requests";
import { RemoteDetailLookups, type RemoteLookupMode } from "./RemoteDetailLookups";

type LookupCallbacks = {
    setData(value: WDetailData): void;
    render(): void;
    isConnected(): boolean;
    schemas(): DetailSchemas;
};
type TargetLoad = {
    cmsUser: boolean;
    failed: boolean;
    key: string;
    generation: number;
    options: DetailOptions[string];
    page?: DetailLookupPage;
    remote?: RemoteLookupMode;
};
const CMS_USER_LOAD_ERROR = "Unable to load CMS users. Focus or click to retry.";

export class DetailLookups {
    private currentOptions: DetailOptions = {};
    private scopeKey = "";
    private scopeGeneration = 0;
    private reloadTimer: ReturnType<typeof setTimeout> | null = null;
    private userOptionsRequest: Promise<DetailOptions[string]> | null = null;
    private readonly cmsUserErrors = new Set<string>();
    private readonly pendingTargetKeys = new Set<string>();
    private readonly retryingCmsUserTargetKeys = new Set<string>();
    private readonly targets: DetailRequestTargets;
    private readonly remote: RemoteDetailLookups;

    constructor(
        private readonly dataset: DOMStringMap,
        private readonly fields: DetailFieldState,
        private readonly requests: DetailRequestCoordinator,
        private readonly callbacks: LookupCallbacks,
    ) {
        this.targets = new DetailRequestTargets(requests);
        this.remote = new RemoteDetailLookups(dataset, fields, requests, this.targets, {
            get: () => this.currentOptions,
            set: (options) => {
                this.currentOptions = options;
            },
        });
    }

    get options(): DetailOptions {
        return this.currentOptions;
    }

    decorate(value: WDetailData): WDetailData {
        const field = (item: WDetailField): WDetailField => {
            const decorated = this.remote.decorateField(item);
            return decorated.input === "cms-user" && this.cmsUserErrors.has(decorated.id)
                ? { ...decorated, invalid: true, hint: CMS_USER_LOAD_ERROR, hintLevel: "error" }
                : decorated;
        };
        return {
            ...value,
            main: value.main.map((section) => ({ ...section, fields: section.fields.map(field) })),
            aside: value.aside.map((section) => ({ ...section, fields: section.fields.map(field) })),
        };
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
        loadOptions: { targetKeys?: ReadonlySet<string>; useLatestFields?: boolean } = {},
    ): Promise<void> {
        if (!loadOptions.targetKeys) {
            this.clearPendingRefresh();
        }
        const targetKeys = [...(loadOptions.targetKeys ?? allLookupTargetKeys(widget))].filter((key) => {
            const field = cmsUserTarget(widget, key);
            return !field || matchesDashboardVisibility(field.visibleWhen, { fields, resource });
        });
        const scopeGeneration = this.scopeGeneration;
        const results = await Promise.all(
            targetKeys.map((key) => this.loadTarget(widget, resource, sourceId, fields, key)),
        );
        if (this.scopeGeneration !== scopeGeneration) {
            return;
        }

        const next = { ...this.currentOptions };
        let accepted = false;
        let stateChanged = false;
        for (const result of results) {
            if (!this.targets.isCurrent(result.key, result.generation)) {
                continue;
            }
            if (result.cmsUser) {
                const hadError = this.cmsUserErrors.has(result.key);
                result.failed ? this.cmsUserErrors.add(result.key) : this.cmsUserErrors.delete(result.key);
                stateChanged ||= hadError !== result.failed;
            }
            if (result.failed && Object.hasOwn(this.currentOptions, result.key)) {
                continue;
            }
            next[result.key] = result.options;
            if (result.page && result.remote && (result.remote.search || result.remote.pagination)) {
                this.remote.acceptInitial(result.key, result.page, result.remote);
            }
            accepted = true;
        }
        if (!accepted && !stateChanged) {
            return;
        }

        const renderFields = loadOptions.useLatestFields ? this.fields.currentFields() : fields;
        this.currentOptions = next;
        this.callbacks.setData(
            this.decorate(detailData(widget, resource, rowKey, renderFields, next, sourceId, this.callbacks.schemas())),
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
        const targetKeys = lookupTargetKeysDependingOn(binding.widget, changedFieldId);
        const fields = this.fields.currentFields();
        for (const key of allLookupTargetKeys(binding.widget)) {
            const field = cmsUserTarget(binding.widget, key);
            if (
                field &&
                !Object.hasOwn(this.currentOptions, key) &&
                matchesDashboardVisibility(field.visibleWhen, { fields, resource: binding.resource })
            ) {
                targetKeys.add(key);
            }
        }
        if (targetKeys.size === 0) {
            return;
        }
        for (const key of targetKeys) {
            this.pendingTargetKeys.add(key);
            this.invalidateTarget(key);
        }
        this.cancelReloadTimer();
        this.reloadTimer = setTimeout(() => this.runScheduledLoad(), 250);
    }

    retryCmsUser(fieldId: string): void {
        if (!this.cmsUserErrors.has(fieldId) || this.retryingCmsUserTargetKeys.has(fieldId)) {
            return;
        }
        const binding = readDetailBinding(this.dataset);
        const field = binding ? cmsUserTarget(binding.widget, fieldId) : undefined;
        const fields = this.fields.currentFields();
        if (
            !binding?.sourceId ||
            !field ||
            !matchesDashboardVisibility(field.visibleWhen, { fields, resource: binding.resource })
        ) {
            return;
        }
        const scopeGeneration = this.scopeGeneration;
        this.retryingCmsUserTargetKeys.add(fieldId);
        void this.load(binding.widget, binding.resource, binding.rowKey, binding.sourceId, fields, {
            targetKeys: new Set([fieldId]),
            useLatestFields: true,
        }).finally(() => {
            if (this.scopeGeneration !== scopeGeneration) {
                return;
            }
            this.retryingCmsUserTargetKeys.delete(fieldId);
            if (!this.cmsUserErrors.has(fieldId) && this.callbacks.isConnected()) {
                this.fields.control(fieldId)?.focus();
            }
        });
    }

    search(key: string, query: string, control: HTMLElement): void {
        this.remote.search(key, query, control);
    }

    loadMore(key: string, control: HTMLElement): void {
        this.remote.loadMore(key, control);
    }

    clear(): void {
        this.scopeGeneration += 1;
        this.targets.clear();
        this.clearPendingRefresh();
        this.currentOptions = {};
        this.userOptionsRequest = null;
        this.cmsUserErrors.clear();
        this.retryingCmsUserTargetKeys.clear();
        this.remote.clear();
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
        const cmsUser = Boolean(cmsUserTarget(widget, key));
        const lookup = detailLookupTargets(widget).find((target) => target.key === key)?.lookup;
        const remote = this.remote.mode(lookup);
        try {
            if (cmsUser) {
                return await this.loadCmsUser(key, generation, fields[key]);
            }
            const result = await loadDetailLookupOptions(sourceId, widget, resource, fields, {
                targetKeys: new Set([key]),
                loadData: (targetSourceId, ref, vars) => this.requests.load(consumer, targetSourceId, ref, vars),
                vars: this.remote.initialVars(remote),
            });
            return {
                cmsUser,
                failed: result.failedTargetKeys.has(key),
                key,
                generation,
                options: result.options[key] ?? [],
                page: result.pages[key],
                remote,
            };
        } catch {
            return { cmsUser, failed: true, key, generation, options: [] };
        }
    }

    private async loadCmsUser(key: string, generation: number, selected: unknown): Promise<TargetLoad> {
        const request = (this.userOptionsRequest ??= fetchDashboardUsers().then(dashboardUserOptions));
        try {
            const options = preserveCmsUserSelection(await request, selected);
            return { cmsUser: true, failed: false, key, generation, options };
        } catch (error) {
            if (this.userOptionsRequest === request) {
                this.userOptionsRequest = null;
            }
            throw error;
        }
    }

    private runScheduledLoad(): void {
        this.reloadTimer = null;
        const targetKeys = new Set(this.pendingTargetKeys);
        this.pendingTargetKeys.clear();
        const binding = readDetailBinding(this.dataset);
        if (!binding?.sourceId) {
            return;
        }
        void this.load(
            binding.widget,
            binding.resource,
            binding.rowKey,
            binding.sourceId,
            this.fields.currentFields(),
            { targetKeys, useLatestFields: true },
        );
    }

    private invalidateTarget(key: string): number {
        return this.targets.invalidate(key);
    }

    private clearPendingRefresh(): void {
        this.pendingTargetKeys.clear();
        this.cancelReloadTimer();
    }

    private cancelReloadTimer(): void {
        if (this.reloadTimer) {
            clearTimeout(this.reloadTimer);
        }
        this.reloadTimer = null;
    }
}

function preserveCmsUserSelection(options: DetailOptions[string], selected: unknown): DetailOptions[string] {
    const value = typeof selected === "string" ? selected : "";
    if (!value || options.some((option) => option.value === value)) {
        return options;
    }
    return [...options, { value, label: `Unknown CMS user · ${value}` }];
}
