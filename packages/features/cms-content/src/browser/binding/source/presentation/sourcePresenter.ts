import type { SourceState } from "../../core/attrs";
import type { CapturedSourceContent } from "./sourceContent";
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

    result(alias: string | undefined, result: FormSubmitResult): void {
        const state = result.ok ? "loaded" : "error";
        const sourceStatus = statusValue(state, result);
        publishSourceStatus(this.el, sourceStatus, this.options);
        this.renderer.body(this.scope(alias, sourceStatus, result));
        this.renderedBody = true;
    }

    private scope(alias: string | undefined, sourceStatus: SourceStatusValue, value: unknown) {
        return scopeForSourceStatus(this.el, alias, sourceStatus, value, this.options);
    }

    private hasConditions(state: SourceState): boolean {
        return this.conditions.has(state);
    }
}
