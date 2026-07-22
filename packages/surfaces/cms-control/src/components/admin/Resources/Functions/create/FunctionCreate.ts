import "cms-control/components/admin/Layout/ShellDetail/ShellDetail";

import { createFunctionDefinition, fetchFunctionCatalog, route, type FunctionCatalogSource } from "../api";
import { valuePicker, type ValueDraft } from "../../WorkflowEditor/mapping";
import { schemaFieldsEditor, type SchemaFieldDraft } from "../../WorkflowEditor/schemaFields";
import { identifier } from "./editor/controls";
import { buildDefinition } from "./editor/definition";
import { referencesBefore } from "./editor/references";
import { renderCreateShell } from "./editor/shell";
import { stepCard } from "./editor/stepCards";
import { newAssert, newCall, type StepDraft, type StepEditorContext } from "./editor/types";

export class CmsFunctionCreate extends HTMLElement {
    private initialized = false;
    private catalog: FunctionCatalogSource[] = [];
    private steps: StepDraft[] = [];
    private readonly paramsFields: SchemaFieldDraft[] = [];
    private readonly bodyFields: SchemaFieldDraft[] = [];
    private readonly returnValue: ValueDraft = { mode: "reference", value: "" };
    private stepsRoot: HTMLElement | null = null;
    private message: HTMLElement | null = null;
    private saveButton: HTMLButtonElement | null = null;

    connectedCallback(): void {
        if (this.initialized) {
            return;
        }
        this.initialized = true;
        void this.load();
    }

    private async load(): Promise<void> {
        this.render("Loading source catalog...");
        try {
            this.catalog = await fetchFunctionCatalog();
            this.render();
        } catch (error) {
            this.render(error instanceof Error ? error.message : "Failed to load source catalog.");
        }
    }

    private render(state?: string): void {
        if (!renderCreateShell(this, state)) {
            return;
        }
        this.stepsRoot = this.querySelector("[data-role='steps']");
        this.message = this.querySelector("[data-role='message']");
        this.saveButton = this.querySelector("[data-role='save']");
        this.bindActions();
        this.renderInputSchemas();
        this.renderSteps();
    }

    private bindActions(): void {
        this.querySelector("[data-role='add-call']")?.addEventListener("click", () => {
            this.steps.push(newCall(this.catalog, this.steps.length));
            this.renderSteps();
        });
        this.querySelector("[data-role='add-assert']")?.addEventListener("click", () => {
            this.steps.push(newAssert());
            this.renderSteps();
        });
        this.querySelector("[data-role='collapse']")?.addEventListener("click", (event) =>
            this.togglePanels(event.currentTarget as HTMLButtonElement),
        );
        this.bindGuidance();
        this.saveButton?.addEventListener("click", () => void this.save());
    }

    private bindGuidance(): void {
        const name = this.querySelector<HTMLInputElement>("[data-field='name']");
        const id = this.querySelector<HTMLInputElement>("[data-field='id']");
        let idWasEdited = false;
        id?.addEventListener("input", () => (idWasEdited = true));
        name?.addEventListener("input", () => {
            if (id && !idWasEdited) {
                id.value = identifier(name.value);
            }
        });
    }

    private togglePanels(button: HTMLButtonElement): void {
        const panels = Array.from(this.querySelectorAll<HTMLDetailsElement>("details.editor-panel"));
        const shouldOpen = panels.some((panel) => !panel.open);
        for (const panel of panels) {
            panel.open = shouldOpen;
        }
        button.textContent = shouldOpen ? "Collapse all" : "Expand all";
    }

    private renderSteps(): void {
        if (!this.stepsRoot) {
            return;
        }
        const context = this.editorContext();
        this.stepsRoot.replaceChildren(...this.steps.map((step, index) => stepCard(step, index, context)));
        const empty = this.querySelector<HTMLElement>("[data-role='steps-empty']");
        if (empty) {
            empty.hidden = this.steps.length > 0;
        }
        this.renderReturnPicker();
    }

    private renderInputSchemas(): void {
        const refresh = (): void => {
            this.renderInputSchemas();
            this.renderSteps();
        };
        this.querySelector<HTMLElement>("[data-role='params-schema']")?.replaceChildren(
            schemaFieldsEditor(this.paramsFields, refresh, false),
        );
        this.querySelector<HTMLElement>("[data-role='body-schema']")?.replaceChildren(
            schemaFieldsEditor(this.bodyFields, refresh),
        );
    }

    private renderReturnPicker(): void {
        this.querySelector<HTMLElement>("[data-role='return-picker']")?.replaceChildren(
            valuePicker(
                this.returnValue,
                referencesBefore(this.editorContext(), this.steps.length),
                "No response body",
            ),
        );
    }

    private move(index: number, offset: number): void {
        const target = index + offset;
        if (target < 0 || target >= this.steps.length) {
            return;
        }
        [this.steps[index], this.steps[target]] = [this.steps[target]!, this.steps[index]!];
        this.renderSteps();
    }

    private async save(): Promise<void> {
        if (!this.saveButton) {
            return;
        }
        this.setMessage("Validating function...", "");
        this.saveButton.disabled = true;
        try {
            const created = await createFunctionDefinition(
                buildDefinition(this, this.editorContext(), this.returnValue),
            );
            window.location.href = route(`/admin/functions/detail?id=${encodeURIComponent(created.id)}`);
        } catch (error) {
            this.setMessage(error instanceof Error ? error.message : "Failed to create function.", "error");
            this.saveButton.disabled = false;
        }
    }

    private editorContext(): StepEditorContext {
        return {
            catalog: this.catalog,
            steps: this.steps,
            paramsFields: this.paramsFields,
            bodyFields: this.bodyFields,
            renderSteps: () => this.renderSteps(),
            moveStep: (index, offset) => this.move(index, offset),
        };
    }

    private setMessage(text: string, kind: "" | "error"): void {
        if (!this.message) {
            return;
        }
        this.message.className = `message ${kind}`.trim();
        this.message.textContent = text;
    }
}

if (!customElements.get("cms-function-create")) {
    customElements.define("cms-function-create", CmsFunctionCreate);
}
