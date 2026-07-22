/** Fetches one `cms-source`, owns reload hooks, and updates its body reactively. */

import { runFetch } from "./fetcher";
import { type FilterMap } from "../core/interpolate";
import { READY_ATTR, SOURCE_ATTR, type SourceState } from "../core/attrs";
import { captureSourceContent, cloneSourceContent } from "./presentation/sourceContent";
import { listenSourceEvents, sourceTrigger } from "./sourceEvents";
import { parseSourceSpec } from "./runtime/sourceSpec";
import { resolveReactiveUrl } from "./runtime/reactiveUrl";
import { SourceRenderer } from "./presentation/sourceRenderer";
import { SourcePresenter } from "./presentation/sourcePresenter";
import { type SourceStatusOptions } from "./presentation/sourceStatus";
import { ownerForm, SourceSubmission } from "./submission";

export { clearRuntimeStamps } from "./runtime/runtimeStamps";
export { RELOAD_ATTR, RELOAD_EVENT } from "./sourceEvents";
export type { SourceStatusValue } from "./presentation/sourceStatus";

type SourceOptions = SourceStatusOptions & {
    sourceStateForce?: SourceState;
    afterSourceRender?: (source: Element) => void;
};

export class Source {
    private readonly renderer: SourceRenderer;
    private readonly presenter: SourcePresenter;
    private abort: AbortController | null = null;
    private stopListeners: (() => void) | null = null;
    private lastUrl: string | null = null;
    private readonly formOwned: boolean;
    private readonly submission: SourceSubmission | null;

    private readonly onReload = () => {
        if (this.el.isConnected) {
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
        if (valid && this.el.isConnected) {
            void this.run();
        }
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
        this.presenter = new SourcePresenter(el, captured, this.renderer, this.options);
    }

    start(): void {
        this.stopListeners = listenSourceEvents(this.el, {
            onReload: this.onReload,
            onReactiveUrlChange: this.onReactiveUrlChange,
            onSubmit: this.onSubmit,
            onChange: this.onChange,
        });
        if (sourceTrigger(this.el) === "auto" || this.options.sourceStateForce) {
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
        this.abort?.abort();
        this.abort = null;
        this.stopListeners?.();
        this.stopListeners = null;
    }

    renderTemplate(): void {
        this.abort?.abort();
        this.abort = null;
        this.renderer.template();
    }

    async run(opts?: { onlyIfUrlChanged?: boolean }): Promise<void> {
        if (this.options.sourceStateForce && this.options.sourceStateForce !== "loaded") {
            this.abort?.abort();
            this.abort = null;
            this.presenter.forced(this.options.sourceStateForce);
            return;
        }

        const spec = parseSourceSpec(this.el.getAttribute(SOURCE_ATTR) ?? "");
        if (!spec.url) {
            return;
        }
        const url = resolveReactiveUrl(spec.url, this.el.ownerDocument);
        if (opts?.onlyIfUrlChanged && url === this.lastUrl) {
            return;
        }
        this.lastUrl = url;

        const submission = this.submission?.capture() ?? null;
        if (this.formOwned && !submission) {
            return;
        }

        this.presenter.loading(spec.alias);
        this.afterRender();
        this.abort?.abort();
        const ac = new AbortController();
        this.abort = ac;

        if (this.formOwned) {
            if (!submission) {
                return;
            }
            const result = await this.submission!.send(submission, url, ac.signal);
            if (ac.signal.aborted) {
                return;
            }
            this.presenter.result(spec.alias, result);
            this.afterRender();
            this.submission!.complete(result, spec.alias);
            return;
        }

        const outcome = await runFetch(url, ac.signal);
        if (ac.signal.aborted || outcome.kind === "aborted") {
            return;
        }
        if (outcome.kind === "error") {
            this.presenter.error(spec.alias, url, outcome.status, outcome.message);
            this.afterRender();
            return;
        }

        this.presenter.data(spec.alias, outcome.data);
        this.afterRender();
    }

    private afterRender(): void {
        this.options.afterSourceRender?.(this.el);
    }
}
