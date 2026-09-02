import type { DashboardEmbeddedLookupRef } from "@bernouy/cms-dashboards";
import type { DetailOptions } from "../../../../runtime/mapping";
import {
    detailLookupTargets,
    loadDetailLookupOptions,
    lookupUsesOffsetPagination,
    lookupUsesRemoteSearch,
    type DetailLookupPage,
} from "../../../../runtime/lookups";
import type { RuntimeVars } from "../../../../runtime/expressions";
import type { WDetailField } from "../../types";
import { DetailFieldState, readDetailBinding } from "../fieldState";
import { DetailRequestCoordinator, DetailRequestTargets } from "../requests";

const PAGE_SIZE = 25;

export type RemoteLookupMode = { search: boolean; pagination: boolean };
type RemoteLookupState = DetailLookupPage &
    RemoteLookupMode & {
        loading: boolean;
        offset: number;
        query: string;
    };
type OptionsState = {
    get(): DetailOptions;
    set(options: DetailOptions): void;
};

export class RemoteDetailLookups {
    private readonly states = new Map<string, RemoteLookupState>();
    private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

    constructor(
        private readonly dataset: DOMStringMap,
        private readonly fields: DetailFieldState,
        private readonly requests: DetailRequestCoordinator,
        private readonly targets: DetailRequestTargets,
        private readonly options: OptionsState,
    ) {}

    mode(lookup: DashboardEmbeddedLookupRef | undefined): RemoteLookupMode {
        return {
            search: lookup ? lookupUsesRemoteSearch(lookup) : false,
            pagination: lookup ? lookupUsesOffsetPagination(lookup) : false,
        };
    }

    initialVars(mode: RemoteLookupMode): Pick<RuntimeVars, "search" | "limit" | "offset"> {
        return {
            ...(mode.search ? { search: "" } : {}),
            ...(mode.pagination ? { limit: PAGE_SIZE, offset: 0 } : {}),
        };
    }

    acceptInitial(key: string, page: DetailLookupPage, mode: RemoteLookupMode): void {
        this.states.set(key, { ...page, ...mode, loading: false, offset: 0, query: "" });
    }

    decorateField(field: WDetailField): WDetailField {
        const decorate = <T extends { lookupKey?: string }>(item: T): T => {
            const state = item.lookupKey ? this.states.get(item.lookupKey) : undefined;
            return state ? ({ ...item, lookupLoading: state.loading, lookupHasMore: this.hasMore(state) } as T) : item;
        };
        const decorated = decorate(field);
        return {
            ...decorated,
            ...(decorated.columns ? { columns: decorated.columns.map(decorate) } : {}),
            ...(decorated.reorderableFields ? { reorderableFields: decorated.reorderableFields.map(decorate) } : {}),
        };
    }

    search(key: string, query: string, control: HTMLElement): void {
        const target = this.target(key);
        if (!target || !lookupUsesRemoteSearch(target.lookup)) {
            return;
        }
        this.cancelTimer(key);
        this.targets.invalidate(key);
        control.setAttribute("loading", "");
        control.removeAttribute("has-more");
        this.timers.set(
            key,
            setTimeout(() => {
                this.timers.delete(key);
                void this.loadPage(key, query, 0, control, false);
            }, 250),
        );
    }

    loadMore(key: string, control: HTMLElement): void {
        const state = this.states.get(key);
        if (!state?.pagination || state.loading || !this.hasMore(state)) {
            return;
        }
        void this.loadPage(key, state.query, state.offset + state.received, control, true);
    }

    clear(): void {
        this.states.clear();
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.timers.clear();
    }

    private async loadPage(
        key: string,
        query: string,
        offset: number,
        control: HTMLElement,
        append: boolean,
    ): Promise<void> {
        const binding = readDetailBinding(this.dataset);
        const target = this.target(key);
        if (!binding?.sourceId || !target) {
            control.removeAttribute("loading");
            return;
        }
        const mode = this.mode(target.lookup);
        const consumer = this.targets.consumer(key);
        const generation = this.targets.invalidate(key);
        const previous = this.states.get(key);
        this.states.set(key, {
            ...(previous ?? { received: 0 }),
            ...mode,
            loading: true,
            offset,
            query,
        });
        control.setAttribute("loading", "");
        control.removeAttribute("has-more");
        const result = await loadDetailLookupOptions(
            binding.sourceId,
            binding.widget,
            binding.resource,
            this.fields.currentFields(),
            {
                targetKeys: new Set([key]),
                loadData: (sourceId, ref, vars) => this.requests.load(consumer, sourceId, ref, vars),
                vars: {
                    ...(mode.search ? { search: query } : {}),
                    ...(mode.pagination ? { limit: PAGE_SIZE, offset } : {}),
                },
            },
        );
        if (!this.targets.isCurrent(key, generation)) {
            return;
        }
        if (result.failedTargetKeys.has(key)) {
            const state = previous ? { ...previous, loading: false } : this.states.get(key)!;
            this.states.set(key, state);
            this.updateControl(control, this.options.get()[key] ?? [], this.hasMore(state));
            return;
        }
        const page = result.pages[key] ?? { received: 0 };
        const pageOptions = result.options[key] ?? [];
        const options = append ? dedupeOptions([...(this.options.get()[key] ?? []), ...pageOptions]) : pageOptions;
        this.options.set({ ...this.options.get(), [key]: options });
        const state = { ...page, ...mode, loading: false, offset, query };
        this.states.set(key, state);
        this.updateControl(control, options, this.hasMore(state));
    }

    private target(key: string) {
        const binding = readDetailBinding(this.dataset);
        return binding ? detailLookupTargets(binding.widget).find((item) => item.key === key) : undefined;
    }

    private updateControl(control: HTMLElement, options: DetailOptions[string], hasMore: boolean): void {
        control.removeAttribute("loading");
        control.toggleAttribute("has-more", hasMore);
        if (!control.isConnected) {
            return;
        }
        const selected = "value" in control ? String((control as { value: unknown }).value ?? "") : "";
        control.replaceChildren(
            ...options.map((option) => {
                const element = document.createElement("option");
                element.value = option.value;
                element.textContent = option.label;
                element.selected = option.value === selected;
                return element;
            }),
        );
    }

    private hasMore(state: RemoteLookupState): boolean {
        if (!state.pagination) {
            return false;
        }
        return state.total === undefined ? state.received >= PAGE_SIZE : state.offset + state.received < state.total;
    }

    private cancelTimer(key: string): void {
        const timer = this.timers.get(key);
        if (timer) {
            clearTimeout(timer);
        }
        this.timers.delete(key);
    }
}

function dedupeOptions(options: DetailOptions[string]): DetailOptions[string] {
    const seen = new Set<string>();
    return options.filter((option) => {
        if (seen.has(option.value)) {
            return false;
        }
        seen.add(option.value);
        return true;
    });
}
