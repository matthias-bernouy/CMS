import { SOURCE_ATTR, type SourceState } from "../../core/attrs";
import { isEmpty, type CapturedSourceContent } from "./sourceContent";
import { parseSourceSpec } from "../runtime/sourceSpec";
import { SourceRenderer } from "./sourceRenderer";
import {
    publishSourceStatus,
    scopeForSourceStatus,
    sourceStatusConditions,
    statusValue,
    type SourceStatusValue,
    type SourceStatusOptions,
} from "./sourceStatus";
import type { FormSubmitResult } from "../../submit/formSubmit";

export class SourcePresenter {
    private readonly conditions: Set<SourceState>;
    private renderedBody = false;
    private currentData: unknown;

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
        this.renderedBody = true;
    }

    loading(alias: string | undefined): void {
        const loading = statusValue("loading", undefined);
        publishSourceStatus(this.el, loading, this.options);
        if (this.renderedBody && !this.hasConditions("loading")) {
            return;
        }
        this.renderer.body(this.scope(alias, loading, undefined));
        this.renderedBody = true;
    }

    error(alias: string | undefined, url: string, status: number | null, message: string): void {
        const errorValue = { status, message };
        const errorStatus = statusValue("error", errorValue);
        publishSourceStatus(this.el, errorStatus, this.options);
        this.renderer.body(this.scope(alias, errorStatus, errorValue));
        this.renderedBody = true;
        if (!this.hasConditions("error")) {
            console.warn(`cms-source "${url}": ${message}`);
        }
    }

    data(alias: string | undefined, data: unknown): void {
        this.currentData = data;
        const state = isEmpty(data) ? "empty" : "loaded";
        const sourceStatus = statusValue(state, data);
        publishSourceStatus(this.el, sourceStatus, this.options);
        const scope = this.scope(alias, sourceStatus, data);
        this.renderer.body(scope);
        this.renderedBody = true;
    }

    refresh(alias: string | undefined, failure?: { status: number | null; message: string }): void {
        const status = {
            ...statusValue(isEmpty(this.currentData) ? "empty" : "loaded", this.currentData),
            refreshing: !failure,
            refreshError: Boolean(failure),
            ...(failure ?? {}),
        };
        publishSourceStatus(this.el, status, this.options);
        this.renderer.body(this.scope(alias, status, this.currentData));
    }

    result(alias: string | undefined, result: FormSubmitResult): void {
        const state = result.ok ? "loaded" : "error";
        const sourceStatus = statusValue(state, result);
        publishSourceStatus(this.el, sourceStatus, this.options);
        this.renderer.body(this.scope(alias, sourceStatus, result));
        this.renderedBody = true;
    }

    forced(state: Exclude<SourceState, "loaded">): void {
        const forcedValue = state === "error" ? { status: 0, message: "Forced error state" } : undefined;
        const forcedStatus = statusValue(state, forcedValue);
        const spec = parseSourceSpec(this.el.getAttribute(SOURCE_ATTR) ?? "");
        publishSourceStatus(this.el, forcedStatus, this.options);
        this.renderer.body(this.scope(spec.alias, forcedStatus, forcedValue));
        this.renderedBody = true;
    }

    private scope(alias: string | undefined, sourceStatus: SourceStatusValue, value: unknown) {
        return scopeForSourceStatus(this.el, alias, sourceStatus, value, this.options);
    }

    private hasConditions(state: SourceState): boolean {
        return this.conditions.has(state);
    }
}
