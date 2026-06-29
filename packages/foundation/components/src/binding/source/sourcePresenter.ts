import { SOURCE_ATTR, type SourceState } from "../attrs";
import { isEmpty, type CapturedSourceContent } from "./sourceContent";
import { parseSourceSpec } from "./sourceSpec";
import { SourceRenderer } from "./sourceRenderer";
import {
    publishSourceStatus,
    scopeForSourceStatus,
    sourceStatusConditions,
    statusValue,
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

    loading(alias: string | undefined): void {
        const loading = statusValue("loading", undefined);
        publishSourceStatus(this.el, loading, this.options);
        if (this.hasConditions("loading")) this.renderer.body(this.scope(alias, loading, undefined));
    }

    error(alias: string | undefined, url: string, status: number | null, message: string): void {
        const errorValue = { status, message };
        const errorStatus = statusValue("error", errorValue);
        publishSourceStatus(this.el, errorStatus, this.options);
        if (this.usesConditions()) this.renderer.body(this.scope(alias, errorStatus, errorValue));
        else {
            this.renderer.clear();
            console.warn(`cms-source "${url}": ${message}`);
        }
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
        publishSourceStatus(this.el, forcedStatus, this.options);
        if (this.usesConditions()) {
            const spec = parseSourceSpec(this.el.getAttribute(SOURCE_ATTR) ?? "");
            this.renderer.body(this.scope(spec.alias, forcedStatus, forcedValue));
            return;
        }
        this.renderer.clear();
    }

    private scope(alias: string | undefined, sourceStatus: ReturnType<typeof statusValue>, value: unknown) {
        return scopeForSourceStatus(this.el, alias, sourceStatus, value, this.options);
    }

    private usesConditions(): boolean {
        return this.conditions.size > 0;
    }

    private hasConditions(state: SourceState): boolean {
        return this.conditions.has(state);
    }
}
