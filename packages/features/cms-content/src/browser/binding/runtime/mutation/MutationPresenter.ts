import type { SourceState } from "../../core/attrs";
import type { FormSubmitResult } from "../../form/formSubmit";
import { BindingRenderer } from "../../reactive/renderer/BindingRenderer";
import type { CapturedBindingContent } from "../../reactive/renderer/bindingContent";
import {
    publishMutationState,
    scopeForMutationState,
    sourceStatusConditions,
    mutationState,
    completedTypedMutationState,
    initialTypedMutationState,
    submittingTypedMutationState,
    type MutationState,
    type MutationStateOptions,
    type TypedMutationState,
} from "./mutationState";

export class MutationPresenter {
    private readonly conditions: Set<SourceState>;
    private renderedBody = false;
    private typed = initialTypedMutationState();

    constructor(
        private readonly el: Element,
        captured: CapturedBindingContent,
        private readonly renderer: BindingRenderer,
        private readonly options: MutationStateOptions,
    ) {
        this.conditions = sourceStatusConditions(captured.body);
    }

    initial(alias: string | undefined, typed = false): void {
        const initial: MutationState = { loading: false, loaded: false, empty: false, error: false };
        this.typed = initialTypedMutationState();
        publishMutationState(this.el, initial, this.options);
        this.renderer.body(this.scope(alias, initial, undefined, typed ? this.typed : undefined));
        this.renderedBody = true;
    }

    loading(alias: string | undefined, typed = false, input?: unknown): void {
        const loading = mutationState("loading", undefined);
        this.typed = submittingTypedMutationState(this.typed, input);
        publishMutationState(this.el, loading, this.options);
        if (this.renderedBody && !this.hasConditions("loading")) {
            return;
        }
        this.renderer.body(this.scope(alias, loading, undefined, typed ? this.typed : undefined));
        this.renderedBody = true;
    }

    result(alias: string | undefined, result: FormSubmitResult, typed = false, input?: unknown): void {
        const state = result.ok ? "loaded" : "error";
        const sourceStatus = mutationState(state, result);
        publishMutationState(this.el, sourceStatus, this.options);
        this.typed = completedTypedMutationState(this.typed, result, input);
        this.renderer.body(this.scope(alias, sourceStatus, result, typed ? this.typed : result));
        this.renderedBody = true;
    }

    private scope(alias: string | undefined, sourceStatus: MutationState, value: unknown, aliasValue?: unknown) {
        return scopeForMutationState(this.el, alias, sourceStatus, value, this.options, aliasValue);
    }

    private hasConditions(state: SourceState): boolean {
        return this.conditions.has(state);
    }
}
