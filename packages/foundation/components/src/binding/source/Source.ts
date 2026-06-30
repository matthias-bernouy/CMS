/** Fetches one `cms-source`, owns reload hooks, and updates its body reactively. */

import { runFetch } from "../fetcher";
import { type FilterMap } from "../interpolate";
import { READY_ATTR, SOURCE_ATTR, type SourceState } from "../attrs";
import { captureSourceContent } from "./sourceContent";
import { listenSourceEvents, sourceTrigger } from "./sourceEvents";
import { parseSourceSpec } from "./sourceSpec";
import { resolveReactiveUrl } from "./reactiveUrl";
import { SourceRenderer } from "./sourceRenderer";
import { SourcePresenter } from "./sourcePresenter";
import { type SourceStatusOptions } from "./sourceStatus";

export { clearRuntimeStamps } from "./runtimeStamps";
export { RELOAD_ATTR, RELOAD_EVENT } from "./sourceEvents";
export type { SourceStatusValue } from "./sourceStatus";

type SourceOptions = SourceStatusOptions & { sourceStateForce?: SourceState };

export class Source {
    private readonly renderer: SourceRenderer;
    private readonly presenter: SourcePresenter;
    private abort: AbortController | null = null;
    private stopListeners: (() => void) | null = null;
    private lastUrl: string | null = null;

    private readonly onReload = () => { if (this.el.isConnected) void this.run(); };
    private readonly onReactiveUrlChange = () => { if (this.el.isConnected) void this.run({ onlyIfUrlChanged: true }); };
    private readonly onSubmit = (event: SubmitEvent) => {
        event.preventDefault();
        if (this.el.isConnected) void this.run();
    };

    constructor(
        private readonly el: Element,
        private readonly filters: FilterMap = {},
        private readonly options: SourceOptions = {},
    ) {
        const captured = captureSourceContent(el);
        this.renderer = new SourceRenderer(el, captured, this.filters);
        this.presenter = new SourcePresenter(el, captured, this.renderer, this.options);
    }

    start(): void {
        this.stopListeners = listenSourceEvents(this.el, {
            onReload: this.onReload,
            onReactiveUrlChange: this.onReactiveUrlChange,
            onSubmit: this.onSubmit,
        });
        if (sourceTrigger(this.el) === "auto" || this.options.sourceStateForce) void this.run();
        else {
            const spec = parseSourceSpec(this.el.getAttribute(SOURCE_ATTR) ?? "");
            if (spec.url) this.presenter.initial(spec.alias);
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
        if (!spec.url) return;
        const url = resolveReactiveUrl(spec.url, this.el.ownerDocument);
        if (opts?.onlyIfUrlChanged && url === this.lastUrl) return;
        this.lastUrl = url;

        this.presenter.loading(spec.alias);
        this.abort?.abort();
        const ac = new AbortController();
        this.abort = ac;

        const outcome = await runFetch(url, ac.signal);
        if (ac.signal.aborted || outcome.kind === "aborted") return;
        if (outcome.kind === "error") {
            this.presenter.error(spec.alias, url, outcome.status, outcome.message);
            return;
        }

        this.presenter.data(spec.alias, outcome.data);
    }

}
