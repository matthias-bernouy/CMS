import { parseQuery } from "cms-content/blocs/core/markup/bindings/source";
import { QUERY_ATTR, READY_ATTR, type SourceState } from "../../core/attrs";
import type { FilterMap } from "../../core/interpolate";
import { runFetch } from "../../source/fetcher";
import { captureSourceContent } from "../../source/presentation/sourceContent";
import { connectSourceContext } from "../../source/presentation/sourceContext";
import { SourceRenderer } from "../../source/presentation/sourceRenderer";
import { shareUnchanged } from "../../source/runtime/refresh/reconcile";
import { connectSourceData, disconnectSourceData, readSourceData, rememberSourceData } from "../../source/values";
import { listenQueryRefresh } from "./queryRefresh";
import { queryRequest } from "./queryRequest";
import {
    failedQueryState,
    initialQueryState,
    loadedQueryState,
    loadingQueryState,
    refreshFailedQueryState,
    refreshingQueryState,
    type QueryState,
} from "./queryState";

type QueryOptions = {
    sourceStateForce?: SourceState;
    afterRender?: (query: Element) => void;
    request?: typeof runFetch;
};

export class Query {
    private readonly renderer: SourceRenderer;
    private state = initialQueryState();
    private abort: AbortController | null = null;
    private stopRefresh: (() => void) | null = null;
    private stopContext: (() => void) | null = null;
    private running = false;
    private queued = false;

    constructor(
        private readonly element: Element,
        filters: FilterMap = {},
        private readonly options: QueryOptions = {},
    ) {
        this.renderer = new SourceRenderer(element, captureSourceContent(element), filters);
    }

    start(): void {
        this.stopContext = connectSourceContext(this.element, () => this.render());
        this.stopRefresh = listenQueryRefresh(this.element, () => void this.run());
        const supplied = connectSourceData(this.element, (value) => this.accept(value));
        if (supplied && !this.options.sourceStateForce) {
            this.accept(supplied.value);
        } else if (this.options.sourceStateForce && this.options.sourceStateForce !== "loaded") {
            this.renderForced(this.options.sourceStateForce);
        } else {
            void this.run();
        }
        this.element.setAttribute(READY_ATTR, "");
    }

    dispose(): void {
        this.abort?.abort();
        this.abort = null;
        this.stopRefresh?.();
        this.stopRefresh = null;
        this.stopContext?.();
        this.stopContext = null;
        disconnectSourceData(this.element);
    }

    renderTemplate(): void {
        this.abort?.abort();
        this.abort = null;
        this.renderer.template();
    }

    async run(): Promise<boolean> {
        if (this.running) {
            this.queued = true;
            return false;
        }
        this.running = true;
        try {
            return await this.execute();
        } finally {
            this.running = false;
            if (this.queued && this.element.isConnected) {
                this.queued = false;
                void this.run();
            }
        }
    }

    private async execute(): Promise<boolean> {
        let request: ReturnType<typeof queryRequest>;
        try {
            request = queryRequest(this.element);
        } catch (error) {
            this.update(failedQueryState(null, error instanceof Error ? error.message : String(error)));
            return false;
        }
        const refreshing = this.state.loaded;
        this.update(refreshing ? refreshingQueryState(this.state) : loadingQueryState());
        this.abort?.abort();
        const controller = new AbortController();
        this.abort = controller;
        const outcome = await (this.options.request ?? runFetch)(request.url, controller.signal, request.init);
        if (this.abort === controller) {
            this.abort = null;
        }
        if (controller.signal.aborted || outcome.kind === "aborted") {
            return false;
        }
        if (outcome.kind === "error") {
            this.update(
                refreshing
                    ? refreshFailedQueryState(this.state, outcome.status, outcome.message)
                    : failedQueryState(outcome.status, outcome.message),
            );
            return false;
        }
        const value = refreshing ? shareUnchanged(readSourceData(this.element), outcome.data) : outcome.data;
        this.accept(value);
        return true;
    }

    private accept(value: unknown): void {
        rememberSourceData(this.element, value);
        this.update(loadedQueryState(value));
    }

    private renderForced(state: Exclude<SourceState, "loaded">): void {
        if (state === "loading") {
            this.update(loadingQueryState());
        } else if (state === "error") {
            this.update(failedQueryState(0, "Forced error state"));
        } else {
            this.update(loadedQueryState(null));
        }
    }

    private update(state: QueryState): void {
        this.state = state;
        this.render();
    }

    private render(): void {
        const binding = parseQuery(this.element.getAttribute(QUERY_ATTR) ?? "");
        if (!binding) {
            return;
        }
        this.renderer.body({ value: this.state.data, vars: { [binding.name]: this.state } });
        this.options.afterRender?.(this.element);
    }
}
