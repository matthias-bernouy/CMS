/** Fetches one `cms-source`, owns reload hooks, and updates its body reactively. */

import { disposeSourceObservation, publishSourceObservation } from "./runtime/observation";
import { runFetch } from "./fetcher";
import { type FilterMap } from "../core/interpolate";
import { READY_ATTR, SOURCE_ATTR, type SourceState } from "../core/attrs";
import { captureSourceContent, cloneSourceContent } from "./presentation/sourceContent";
import { listenSourceEvents, sourceTrigger } from "./sourceEvents";
import { parseSourceSpec } from "./runtime/sourceSpec";
import { resolveReactiveUrl } from "./runtime/reactiveUrl";
import { SourceRenderer } from "./presentation/sourceRenderer";
import { SourcePresenter } from "./presentation/sourcePresenter";
import { type SourceStatusOptions, type SourceStatusValue } from "./presentation/sourceStatus";
import { ownerForm, SourceSubmission } from "./submission";
import { connectSourceData, disconnectSourceData, readSourceData, rememberSourceData } from "./values";
import { connectSourceContext } from "./presentation/sourceContext";
import { shareUnchanged } from "./runtime/refresh/reconcile";
import { connectSourceReload } from "./runtime/refresh/registry";
import { acknowledgeForm } from "./runtime/submission/acknowledgement";
import { SubmissionTransaction } from "./runtime/submission/transaction";

export { clearRuntimeStamps } from "./runtime/runtimeStamps";
export { RELOAD_ATTR, RELOAD_EVENT } from "./sourceEvents";
export type { SourceStatusValue } from "./presentation/sourceStatus";

type SourceOptions = SourceStatusOptions & {
    sourceStateForce?: SourceState;
    afterSourceRender?: (source: Element) => void;
    read?: typeof runFetch;
};

export class Source {
    private readonly renderer: SourceRenderer;
    private readonly presenter: SourcePresenter;
    private abort: AbortController | null = null;
    private stopListeners: (() => void) | null = null;
    private stopContext: (() => void) | null = null;
    private stopReload: (() => void) | null = null;
    private transaction: SubmissionTransaction | null = null;
    private hasData = false;
    private pendingRefresh: { url: string; promise: Promise<boolean> } | null = null;
    private dataUrl: string | null = null;
    private selectionEpoch = 0;
    private pendingChange = false;
    private lastUrl: string | null = null;
    private status: SourceStatusValue = {
        loading: false,
        loaded: false,
        empty: false,
        error: false,
    };
    private readonly formOwned: boolean;
    private readonly submission: SourceSubmission | null;

    private readonly onReload = () => {
        if (this.el.isConnected && !this.pendingRefresh) {
            void this.run();
        }
    };
    private readonly onReactiveUrlChange = () => {
        if (this.el.isConnected) {
            void this.run({ onlyIfUrlChanged: true });
        }
    };
    private readonly onSubmit = (event: SubmitEvent) => {
        const form = ownerForm(event.currentTarget, this.el.ownerDocument) ?? this.el.closest("form");
        const valid = typeof form?.reportValidity === "function" ? form.reportValidity() : true;
        if (!valid) {
            event.preventDefault();
            return;
        }
        event.preventDefault();
        if (this.el.isConnected) {
            void this.run();
        }
    };
    private readonly onChange = () => {
        const form = ownerForm(this.el, this.el.ownerDocument) ?? this.el.closest("form");
        const valid = typeof form?.reportValidity === "function" ? form.reportValidity() : true;
        if (!valid || !this.el.isConnected) {
            return;
        }
        if (this.transaction?.locked) {
            this.pendingChange = true;
            return;
        }
        void this.run().finally(() => {
            if (this.pendingChange) {
                this.pendingChange = false;
                this.onChange();
            }
        });
    };

    constructor(
        private readonly el: Element,
        private readonly filters: FilterMap = {},
        private readonly options: SourceOptions = {},
    ) {
        this.formOwned = ownerForm(el, el.ownerDocument) !== null && sourceTrigger(el) !== "auto";
        this.submission = this.formOwned ? new SourceSubmission(el, filters) : null;
        const captured = this.formOwned ? cloneSourceContent(el) : captureSourceContent(el);
        this.renderer = new SourceRenderer(el, captured, this.filters, { inPlace: this.formOwned });
        this.presenter = new SourcePresenter(el, captured, this.renderer, {
            ...this.options,
            setSourceStatus: (source, status) => {
                this.status = status;
                this.options.setSourceStatus?.(source, status);
            },
        });
    }

    start(): void {
        if (sourceTrigger(this.el) === "auto") {
            this.stopReload = connectSourceReload(this.el, {
                generation: () => this.selectionEpoch,
                url: () =>
                    resolveReactiveUrl(
                        parseSourceSpec(this.el.getAttribute(SOURCE_ATTR) ?? "").url,
                        this.el.ownerDocument,
                    ),
                reload: (acknowledge) => {
                    const url = resolveReactiveUrl(
                        parseSourceSpec(this.el.getAttribute(SOURCE_ATTR) ?? "").url,
                        this.el.ownerDocument,
                    );
                    if (this.pendingRefresh?.url === url) {
                        return this.pendingRefresh.promise;
                    }
                    const promise = this.run({ acknowledge });
                    if (acknowledge) {
                        this.pendingRefresh = { url, promise };
                        void promise.finally(() => {
                            if (this.pendingRefresh?.promise === promise) {
                                this.pendingRefresh = null;
                            }
                        });
                    }
                    return promise;
                },
            });
        }
        this.stopContext = connectSourceContext(this.el, () => {
            this.renderer.refreshContext();
            this.afterRender();
        });
        const supplied =
            sourceTrigger(this.el) === "auto"
                ? connectSourceData(this.el, (value) => this.acceptData(value))
                : undefined;
        this.stopListeners = listenSourceEvents(this.el, {
            onReload: this.onReload,
            onReactiveUrlChange: this.onReactiveUrlChange,
            onSubmit: this.onSubmit,
            onChange: this.onChange,
        });
        if (supplied && !this.options.sourceStateForce) {
            this.acceptData(supplied.value);
        } else if (sourceTrigger(this.el) === "auto" || this.options.sourceStateForce) {
            void this.run();
        } else {
            const spec = parseSourceSpec(this.el.getAttribute(SOURCE_ATTR) ?? "");
            if (spec.url) {
                this.presenter.initial(spec.alias);
                this.afterRender();
            }
        }
        this.el.setAttribute(READY_ATTR, "");
    }

    dispose(): void {
        this.stopReload?.();
        this.stopReload = null;
        this.transaction?.release();
        this.transaction = null;
        this.stopContext?.();
        this.stopContext = null;
        disconnectSourceData(this.el);
        disposeSourceObservation(this.el);
        this.abort?.abort();
        this.abort = null;
        this.stopListeners?.();
        this.stopListeners = null;
    }

    renderTemplate(): void {
        this.abort?.abort();
        this.abort = null;
        this.transaction?.release();
        this.transaction = null;
        this.hasData = false;
        this.dataUrl = null;
        this.renderer.template();
    }

    async run(opts?: { onlyIfUrlChanged?: boolean; acknowledge?: HTMLFormElement }): Promise<boolean> {
        if (this.transaction?.locked) {
            return false;
        }
        if (this.options.sourceStateForce && this.options.sourceStateForce !== "loaded") {
            this.abort?.abort();
            this.abort = null;
            this.presenter.forced(this.options.sourceStateForce);
            return false;
        }

        const spec = parseSourceSpec(this.el.getAttribute(SOURCE_ATTR) ?? "");
        if (!spec.url) {
            return false;
        }
        const url = resolveReactiveUrl(spec.url, this.el.ownerDocument);
        if (opts?.onlyIfUrlChanged && url === this.lastUrl) {
            return false;
        }
        const refreshing = !this.formOwned && this.hasData && url === this.dataUrl;
        if (url !== this.lastUrl) {
            this.selectionEpoch += 1;
        }
        this.lastUrl = url;
        let transaction: SubmissionTransaction | null = null;
        try {
            if (this.submission) {
                transaction = SubmissionTransaction.prepare(this.el, this.submission, url);
                if (!transaction) {
                    return false;
                }
                this.transaction = transaction;
            }
        } catch (error) {
            const result = {
                ok: false,
                status: 0,
                statusText: "Invalid form",
                body: null,
                message: error instanceof Error ? error.message : String(error),
                form: this.el as HTMLFormElement,
            };
            this.presenter.result(spec.alias, result);
            this.afterRender();
            this.submission?.complete(result, spec.alias);
            return false;
        }
        if (this.formOwned && !transaction) {
            return false;
        }

        if (refreshing) {
            this.presenter.refresh(spec.alias);
        } else {
            this.presenter.loading(spec.alias);
        }
        this.afterRender();
        this.abort?.abort();
        const ac = new AbortController();
        this.abort = ac;

        if (transaction) {
            try {
                const result = await transaction.send(url, ac.signal);
                if (!result) {
                    if (!ac.signal.aborted) {
                        this.presenter.initial(spec.alias);
                        this.afterRender();
                    }
                    return false;
                }
                this.abort = null;
                rememberSourceData(this.el, result);
                this.presenter.result(spec.alias, result);
                this.afterRender();
                this.submission!.complete(result, spec.alias);
                return result.ok && result.refresh?.ok !== false;
            } finally {
                if (this.abort === ac) {
                    this.abort = null;
                }
                transaction.release();
                if (this.transaction === transaction) {
                    this.transaction = null;
                }
            }
        }

        const outcome = await (this.options.read ?? runFetch)(url, ac.signal);
        if (ac.signal.aborted || outcome.kind === "aborted") {
            return false;
        }
        const current = parseSourceSpec(this.el.getAttribute(SOURCE_ATTR) ?? "");
        if (resolveReactiveUrl(current.url, this.el.ownerDocument) !== url) {
            void this.run({ onlyIfUrlChanged: true });
            return false;
        }
        this.abort = null;
        if (outcome.kind === "error") {
            if (refreshing) {
                this.presenter.refresh(spec.alias, { status: outcome.status, message: outcome.message });
            } else {
                this.presenter.error(spec.alias, url, outcome.status, outcome.message);
            }
            this.afterRender();
            return false;
        }

        this.acceptData(
            refreshing ? shareUnchanged(readSourceData(this.el), outcome.data) : outcome.data,
            opts?.acknowledge,
        );
        return true;
    }

    private acceptData(value: unknown, acknowledge?: HTMLFormElement): void {
        this.abort?.abort();
        this.abort = null;
        rememberSourceData(this.el, value);
        this.hasData = true;
        const spec = parseSourceSpec(this.el.getAttribute(SOURCE_ATTR) ?? "");
        this.lastUrl = resolveReactiveUrl(spec.url, this.el.ownerDocument);
        this.dataUrl = this.lastUrl;
        acknowledgeForm(acknowledge, () => this.presenter.data(spec.alias, value));
        this.afterRender();
    }

    private afterRender(): void {
        this.options.afterSourceRender?.(this.el);
        publishSourceObservation(this.el, this.status);
    }
}
