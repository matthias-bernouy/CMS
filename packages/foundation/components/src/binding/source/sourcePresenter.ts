import { SOURCE_ATTR, type SourceState } from "../attrs";
import { isEmpty, type CapturedSourceContent } from "./sourceContent";
import { parseSourceSpec } from "./sourceSpec";
import { SourceRenderer } from "./sourceRenderer";
import {
    publishSourceStatus,
    scopeForSourceStatus,
    sourceStatusConditions,
    statusValue,
    type SourceStatusValue,
    type SourceStatusOptions,
} from "./sourceStatus";

export class SourcePresenter {
    private readonly conditions: Set<SourceState>;

    constructor(
        private readonly el: Element,
        captured: CapturedSourceContent,
        private readonly renderer: SourceRenderer,
        private readonly options: SourceStatusOptions,
    ) {
        this.conditions = sourceStatusConditions(captured.body);
    }

    initial(alias: string | undefined): void {
        const initial: SourceStatusValue = { loading: false, loaded: false, empty: false, error: false };
        publishSourceStatus(this.el, initial, this.options);
        this.renderer.body(this.scope(alias, initial, undefined));
    }

    loading(alias: string | undefined): void {
        const loading = statusValue("loading", undefined);
        publishSourceStatus(this.el, loading, this.options);
        this.renderer.body(this.scope(alias, loading, undefined));
    }

    error(alias: string | undefined, url: string, status: number | null, message: string): void {
        const errorValue = { status, message };
        const errorStatus = statusValue("error", errorValue);
        publishSourceStatus(this.el, errorStatus, this.options);
        this.renderer.body(this.scope(alias, errorStatus, errorValue));
        if (!this.hasConditions("error")) console.warn(`cms-source "${url}": ${message}`);
    }

    data(alias: string | undefined, data: unknown): void {
        const state = isEmpty(data) ? "empty" : "loaded";
        const sourceStatus = statusValue(state, data);
        publishSourceStatus(this.el, sourceStatus, this.options);
        const scope = this.scope(alias, sourceStatus, data);
        this.renderer.body(scope);
    }

    forced(state: Exclude<SourceState, "loaded">): void {
        const forcedValue = state === "error" ? { status: 0, message: "Forced error state" } : undefined;
        const forcedStatus = statusValue(state, forcedValue);
        const spec = parseSourceSpec(this.el.getAttribute(SOURCE_ATTR) ?? "");
        publishSourceStatus(this.el, forcedStatus, this.options);
        this.renderer.body(this.scope(spec.alias, forcedStatus, forcedValue));
    }

    private scope(alias: string | undefined, sourceStatus: SourceStatusValue, value: unknown) {
        return scopeForSourceStatus(this.el, alias, sourceStatus, value, this.options);
    }

    private hasConditions(state: SourceState): boolean {
        return this.conditions.has(state);
    }
}
