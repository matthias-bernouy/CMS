import { parseQuery } from "cms-content/blocs/core/markup/bindings/source";
import { QUERY_ATTR, READY_ATTR, type SourceState } from "../../core/attrs";
import type { FilterMap } from "../../core/interpolate";
import { runFetch } from "../../source/fetcher";
import { captureSourceContent } from "../../source/presentation/sourceContent";
import { connectSourceContext } from "../../source/presentation/sourceContext";
import { SourceRenderer } from "../../source/presentation/sourceRenderer";
import { shareUnchanged } from "../../source/runtime/refresh/reconcile";
import { connectQueryReload } from "../../source/runtime/refresh/registry";
import { connectSourceData, disconnectSourceData, readSourceData, rememberSourceData } from "../../source/values";
import { listenQueryRefresh } from "./queryRefresh";
import { queryRequest } from "./queryRequest";
import { parseSyncAttribute, readSyncValue, subscribeSyncValue, writeSyncValue } from "../../params/SyncState";
import {
    failedQueryState,
    initialQueryState,
    loadedQueryState,
    loadingQueryState,
    refreshFailedQueryState,
    refreshingQueryState,
    type QueryState,
    isQueryState,
    waitingQueryState,
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
    private stopReload: (() => void) | null = null;
    private stopSync: (() => void) | null = null;
    private input: unknown;
    private pending: Promise<boolean> | null = null;
    private queued: Promise<boolean> | null = null;
    private queuedForce = false;
    private activeIdentity: string | null = null;
    private lastInputIdentity: string | null = null;

    constructor(
        private readonly element: Element,
        filters: FilterMap = {},
        private readonly options: QueryOptions = {},
    ) {
        this.renderer = new SourceRenderer(element, captureSourceContent(element), filters);
    }

    start(): void {
        this.stopContext = connectSourceContext(this.element, () => this.render());
        const binding = parseQuery(this.element.getAttribute(QUERY_ATTR) ?? "");
        if (binding && "sync" in binding) {
            this.startSynchronizedQuery(binding.sync);
            this.element.setAttribute(READY_ATTR, "");
            return;
        }
        this.stopReload = connectQueryReload(
            this.element,
            () => this.requestIdentity(),
            () => this.run(),
        );
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
        this.stopReload?.();
        this.stopReload = null;
        this.stopContext?.();
        this.stopContext = null;
        this.stopSync?.();
        this.stopSync = null;
        disconnectSourceData(this.element);
    }

    renderTemplate(): void {
        this.abort?.abort();
        this.abort = null;
        this.renderer.template();
    }

    run(options: { readonly onlyIfInputChanged?: boolean } = {}): Promise<boolean> {
        if (this.pending) {
            this.queuedForce ||= !options.onlyIfInputChanged;
            if (this.requestIdentity() !== this.activeIdentity) {
                this.lastInputIdentity = null;
                this.abort?.abort();
            }
            this.queued ??= this.pending.then(() => {
                const force = this.queuedForce;
                this.queued = null;
                this.queuedForce = false;
                return this.element.isConnected ? this.run({ onlyIfInputChanged: !force }) : false;
            });
            return this.queued;
        }
        const operation = this.execute(options).finally(() => {
            if (this.pending === operation) {
                this.pending = null;
            }
        });
        this.pending = operation;
        return operation;
    }

    private async execute(options: { readonly onlyIfInputChanged?: boolean }): Promise<boolean> {
        let request: ReturnType<typeof queryRequest>;
        try {
            request = queryRequest(this.element);
        } catch (error) {
            this.update(failedQueryState(null, error instanceof Error ? error.message : String(error)));
            return false;
        }
        if ("waiting" in request) {
            this.abort?.abort();
            this.abort = null;
            this.input = undefined;
            this.activeIdentity = null;
            if (this.lastInputIdentity !== "waiting" || !options.onlyIfInputChanged) {
                this.lastInputIdentity = "waiting";
                this.update(waitingQueryState());
            }
            return false;
        }
        const identity = `${request.init.method ?? "GET"}\u0000${request.url}\u0000${request.init.body ?? ""}`;
        if (options.onlyIfInputChanged && identity === this.lastInputIdentity) {
            return false;
        }
        this.lastInputIdentity = identity;
        this.activeIdentity = identity;
        this.input = request.input;
        const refreshing = this.state.loaded;
        this.update(this.withInput(refreshing ? refreshingQueryState(this.state) : loadingQueryState()));
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
        if (this.activeIdentity !== identity) {
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
        this.update(this.withInput(loadedQueryState(value)));
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
        const target = parseSyncAttribute(this.element);
        if (target) {
            try {
                writeSyncValue(target, state, this.element.ownerDocument);
            } catch (error) {
                console.warn("cms-sync could not publish query state", error);
            }
        }
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

    private requestIdentity(): string {
        const binding = parseQuery(this.element.getAttribute(QUERY_ATTR) ?? "");
        if (binding && "sync" in binding) {
            return `@${binding.sync.scope}:${binding.sync.key}`;
        }
        try {
            const request = queryRequest(this.element);
            if ("waiting" in request) {
                return "waiting";
            }
            return `${request.init.method ?? "GET"}\u0000${request.url}\u0000${request.init.body ?? ""}`;
        } catch {
            return "";
        }
    }

    private startSynchronizedQuery(target: { scope: "param" | "page" | "session" | "persistent"; key: string }): void {
        const accept = (value: unknown) => {
            if (value === undefined) {
                this.state = initialQueryState();
                this.render();
            } else if (isQueryState(value)) {
                this.state = value;
                rememberSourceData(this.element, value.data);
                this.render();
            } else {
                this.accept(value);
            }
        };
        accept(readSyncValue(target, this.element.ownerDocument));
        this.stopSync = subscribeSyncValue(target, accept, this.element.ownerDocument);
    }

    private withInput(state: QueryState): QueryState {
        return this.input === undefined ? state : { ...state, input: this.input };
    }
}
