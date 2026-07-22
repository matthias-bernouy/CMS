import "cms-control/components/admin/Layout/ShellDetail/ShellDetail";

import type { FunctionCatalogSource } from "../Functions/api";
import type { ValueDraft } from "../WorkflowEditor/mapping";
import { createTriggerDefinition, fetchTriggerCatalog, route, type TriggerFunctionItem } from "./api";
import { checkbox, identifier, input, select } from "./create/controls";
import { buildTriggerDefinition } from "./create/definition";
import { renderConditionPickers, renderFunctionMappings } from "./create/mappings";
import {
    populateFunctions,
    populateSources,
    renderShell,
    renderState,
    syncConditionVisibility,
    syncEndpointOptions,
    syncExecutionOptions,
    syncFunctionContract,
    syncPhaseHelp,
} from "./create/view";

export class CmsTriggerCreate extends HTMLElement {
    private initialized = false;
    private sources: FunctionCatalogSource[] = [];
    private functions: TriggerFunctionItem[] = [];
    private readonly conditionLeft: ValueDraft = { mode: "reference", value: "$response.status" };
    private readonly conditionRight: ValueDraft = { mode: "literal", value: "200" };
    private functionParams: Record<string, ValueDraft> = {};
    private functionBody: Record<string, ValueDraft> = {};
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
        renderState(this, "Loading sources and functions...");
        try {
            const catalog = await fetchTriggerCatalog();
            this.sources = catalog.sources;
            this.functions = catalog.functions;
            this.render();
        } catch (error) {
            renderState(this, error instanceof Error ? error.message : "Failed to load trigger catalog.");
        }
    }

    private render(): void {
        renderShell(this);
        this.message = this.querySelector("[data-role='message']");
        this.saveButton = this.querySelector("[data-role='save']");
        populateSources(this, this.sources);
        populateFunctions(this, this.functions);
        this.bind();
        syncEndpointOptions(this, this.sources);
        syncFunctionContract(this, this.functions);
        syncExecutionOptions(this);
        syncPhaseHelp(this);
        this.renderCondition();
        this.renderMappings();
    }

    private bind(): void {
        select(this, "source").addEventListener("change", () => {
            syncEndpointOptions(this, this.sources);
            this.resetEventMappings();
        });
        select(this, "endpoint").addEventListener("change", () => this.resetEventMappings());
        select(this, "function").addEventListener("change", () => {
            this.functionParams = {};
            this.functionBody = {};
            syncFunctionContract(this, this.functions);
            this.renderMappings();
        });
        select(this, "mode").addEventListener("change", () => syncExecutionOptions(this));
        select(this, "phase").addEventListener("change", () => {
            syncPhaseHelp(this);
            this.resetEventMappings();
        });
        select(this, "operator").addEventListener("change", () => this.renderCondition());
        checkbox(this, "condition-enabled").addEventListener("change", () => this.renderCondition());
        this.querySelector("[data-role='collapse']")?.addEventListener("click", (event) => {
            this.togglePanels(event.currentTarget as HTMLButtonElement);
        });
        this.bindIdentifier();
        this.saveButton?.addEventListener("click", () => void this.save());
    }

    private bindIdentifier(): void {
        const label = input(this, "label");
        const id = input(this, "id");
        let idWasEdited = false;
        id.addEventListener("input", () => (idWasEdited = true));
        label.addEventListener("input", () => {
            if (!idWasEdited) {
                id.value = identifier(label.value);
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

    private resetEventMappings(): void {
        this.conditionLeft.value = "";
        this.conditionLeft.mode = "reference";
        this.functionParams = {};
        this.functionBody = {};
        this.renderCondition();
        this.renderMappings();
    }

    private renderCondition(): void {
        syncConditionVisibility(this);
        renderConditionPickers(this, this.sources, this.conditionLeft, this.conditionRight);
    }

    private renderMappings(): void {
        renderFunctionMappings(this, this.sources, this.functions, this.functionParams, this.functionBody);
    }

    private async save(): Promise<void> {
        if (!this.saveButton) {
            return;
        }
        this.saveButton.disabled = true;
        this.setMessage("Validating trigger...", "");
        try {
            const definition = buildTriggerDefinition(
                this,
                this.conditionLeft,
                this.conditionRight,
                this.functionParams,
                this.functionBody,
            );
            await createTriggerDefinition(definition, checkbox(this, "enabled").checked);
            window.location.href = route("/admin/triggers");
        } catch (error) {
            this.setMessage(error instanceof Error ? error.message : "Failed to create trigger.", "error");
            this.saveButton.disabled = false;
        }
    }

    private setMessage(text: string, kind: "" | "error"): void {
        if (!this.message) {
            return;
        }
        this.message.className = `message ${kind}`.trim();
        this.message.textContent = text;
    }
}

if (!customElements.get("cms-trigger-create")) {
    customElements.define("cms-trigger-create", CmsTriggerCreate);
}
