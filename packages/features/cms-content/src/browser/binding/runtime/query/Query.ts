import { parseQuery } from "cms-content/blocs/core/markup/bindings/operation";
import { QUERY_ATTR } from "../../core/attrs";
import type { FilterMap } from "../../core/interpolate";
import { BindingRenderer } from "../../reactive/renderer/BindingRenderer";
import { captureBindingContent } from "../../reactive/renderer/bindingContent";
import { parseSyncAttribute, readSyncValue, subscribeSyncValue, writeSyncValue } from "../../state/SyncState";
import { withFormAcknowledgement, connectQueryReload } from "./mutationRefresh";
import { runFetch } from "./queryFetch";
import { listenQueryRefresh } from "./queryRefresh";
import { queryRequest } from "./queryRequest";
import { shareUnchanged } from "./reconcile";
import { QueryImports } from "./QueryImports";
import {
    failedQueryState,
    fetchingQueryState,
    initialQueryState,
    isQueryState,
    successfulQueryState,
    type QueryState,
    waitingQueryState,
} from "./queryState";

type QueryOptions = {
    afterRender?: (query: Element) => void;
    request?: typeof runFetch;
};

export class Query {
    private readonly renderer: BindingRenderer;
    private readonly imports: QueryImports;
    private state = initialQueryState();
    private abort: AbortController | null = null;
    private stopRefresh: (() => void) | null = null;
    private stopReload: (() => void) | null = null;
    private stopSync: (() => void) | null = null;
    private input: unknown;
    private pending: Promise<boolean> | null = null;
    private queued: Promise<boolean> | null = null;
    private queuedForce = false;
    private queuedAcknowledgement: HTMLFormElement | undefined;
    private activeIdentity: string | null = null;
    private lastInputIdentity: string | null = null;

    constructor(
        private readonly element: Element,
        filters: FilterMap = {},
        private readonly options: QueryOptions = {},
    ) {
        this.renderer = new BindingRenderer(element, captureBindingContent(element), filters);
        this.imports = new QueryImports(element, () => this.render());
    }

    start(): void {
        this.imports.start();
        const binding = parseQuery(this.element.getAttribute(QUERY_ATTR) ?? "");
        if (!binding) {
            this.render();
            return;
        }
        if (binding && "sync" in binding) {
            this.startSynchronizedQuery(binding.sync);
            return;
        }
        this.stopReload = connectQueryReload(
            this.element,
            () => this.requestIdentity(),
            (acknowledge) => this.run({ acknowledge }),
        );
        this.stopRefresh = listenQueryRefresh(this.element, (acknowledge) => void this.run({ acknowledge }));
        void this.run();
    }

    dispose(): void {
        this.abort?.abort();
        this.abort = null;
        this.stopRefresh?.();
        this.stopRefresh = null;
        this.stopReload?.();
        this.stopReload = null;
        this.stopSync?.();
        this.stopSync = null;
        this.imports.dispose();
    }

    renderTemplate(): void {
        this.abort?.abort();
        this.abort = null;
        this.renderer.template();
    }

    run(
        options: { readonly onlyIfInputChanged?: boolean; readonly acknowledge?: HTMLFormElement } = {},
    ): Promise<boolean> {
        if (this.pending) {
            this.queuedForce ||= !options.onlyIfInputChanged;
            this.queuedAcknowledgement = options.acknowledge ?? this.queuedAcknowledgement;
            if (this.requestIdentity() !== this.activeIdentity) {
                this.lastInputIdentity = null;
                this.abort?.abort();
            }
            this.queued ??= this.pending.then(() => {
                const force = this.queuedForce;
                const acknowledge = this.queuedAcknowledgement;
                this.queued = null;
                this.queuedForce = false;
                this.queuedAcknowledgement = undefined;
                return this.element.isConnected ? this.run({ onlyIfInputChanged: !force, acknowledge }) : false;
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

    private async execute(options: {
        readonly onlyIfInputChanged?: boolean;
        readonly acknowledge?: HTMLFormElement;
    }): Promise<boolean> {
        let request: ReturnType<typeof queryRequest>;
        try {
            request = queryRequest(this.element);
        } catch (error) {
            this.update(
                failedQueryState(this.state, {
                    kind: "failure",
                    code: "invalid_query",
                    retryable: false,
                }),
            );
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
        this.update(this.withInput(fetchingQueryState(this.state)));
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
        if (outcome.kind === "error" || outcome.kind === "failure") {
            this.update(failedQueryState(this.state, outcome));
            return false;
        }
        const value = this.state.hasData ? shareUnchanged(this.state.data, outcome.data) : outcome.data;
        this.accept(value, { ...outcome, status: outcome.status ?? 200 }, options.acknowledge);
        return true;
    }

    private accept(
        value: unknown,
        result: { readonly status: number; readonly requestId?: string } = { status: 200 },
        acknowledge?: HTMLFormElement,
    ): void {
        withFormAcknowledgement(acknowledge, () =>
            this.update(this.withInput(successfulQueryState(this.state, value, result))),
        );
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
        const vars: Record<string, unknown> = this.imports.variables();
        if (binding) {
            vars[binding.name] = this.state;
        }
        this.renderer.body({ value: binding ? this.state.data : undefined, vars });
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
