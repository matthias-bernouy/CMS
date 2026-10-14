import type { FormSubmitResult } from "../../form/formSubmit";
import { BindingRenderer } from "../../reactive/renderer/BindingRenderer";
import {
    completedMutationState,
    initialMutationState,
    mutationScope,
    submittingMutationState,
    type MutationState,
} from "./mutationState";

export class MutationPresenter {
    private state = initialMutationState();

    constructor(private readonly renderer: BindingRenderer) {}

    initial(alias: string): MutationState {
        this.state = initialMutationState();
        this.render(alias);
        return this.state;
    }

    loading(alias: string, input?: unknown): MutationState {
        this.state = submittingMutationState(this.state, input);
        this.render(alias);
        return this.state;
    }

    result(alias: string, result: FormSubmitResult, input?: unknown): MutationState {
        this.state = completedMutationState(this.state, result, input);
        this.render(alias);
        return this.state;
    }

    private render(alias: string): void {
        this.renderer.body(mutationScope(alias, this.state));
    }
}
