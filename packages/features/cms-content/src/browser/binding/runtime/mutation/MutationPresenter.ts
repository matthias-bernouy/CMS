import type { SourceState } from "../../core/attrs";
import type { FormSubmitResult } from "../../form/formSubmit";
import { BindingRenderer } from "../../reactive/renderer/BindingRenderer";
import type { CapturedBindingContent } from "../../reactive/renderer/bindingContent";
import {
    publishMutationState,
    scopeForMutationState,
    sourceStatusConditions,
    mutationState,
    type MutationState,
    type MutationStateOptions,
} from "./mutationState";

export class MutationPresenter {
    private readonly conditions: Set<SourceState>;
    private renderedBody = false;

    constructor(
        private readonly el: Element,
        captured: CapturedBindingContent,
        private readonly renderer: BindingRenderer,
        private readonly options: MutationStateOptions,
    ) {
        this.conditions = sourceStatusConditions(captured.body);
    }

    initial(alias: string | undefined): void {
        const initial: MutationState = { loading: false, loaded: false, empty: false, error: false };
        publishMutationState(this.el, initial, this.options);
        this.renderer.body(this.scope(alias, initial, undefined));
        this.renderedBody = true;
    }

    loading(alias: string | undefined): void {
        const loading = mutationState("loading", undefined);
        publishMutationState(this.el, loading, this.options);
        if (this.renderedBody && !this.hasConditions("loading")) {
            return;
        }
        this.renderer.body(this.scope(alias, loading, undefined));
        this.renderedBody = true;
    }

    result(alias: string | undefined, result: FormSubmitResult): void {
        const state = result.ok ? "loaded" : "error";
        const sourceStatus = mutationState(state, result);
        publishMutationState(this.el, sourceStatus, this.options);
        this.renderer.body(this.scope(alias, sourceStatus, result));
        this.renderedBody = true;
    }

    private scope(alias: string | undefined, sourceStatus: MutationState, value: unknown) {
        return scopeForMutationState(this.el, alias, sourceStatus, value, this.options);
    }

    private hasConditions(state: SourceState): boolean {
        return this.conditions.has(state);
    }
}
