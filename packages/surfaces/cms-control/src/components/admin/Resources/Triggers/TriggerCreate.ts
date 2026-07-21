import type { FunctionCondition, FunctionValue } from "@bernouy/cms-functions";
import type { TriggerDefinition } from "@bernouy/cms-triggers";
import "cms-control/components/admin/ShellDetail/ShellDetail";
import type { FunctionCatalogSource } from "../Functions/api";
import { createTriggerDefinition, fetchTriggerCatalog, route, type TriggerFunctionItem } from "./api";
import css from "./create.css" with { type: "text" };
import template from "./create.template.html" with { type: "text" };
import {
    mappedObject,
    mappingEditor,
    referencesFromShape,
    resolvedDraftValue,
    targetsFromShape,
    valuePicker,
    type MappingShape,
    type MappingTarget,
    type ReferenceOption,
    type ValueDraft,
} from "../WorkflowEditor/mapping";

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
        this.renderState("Loading sources and functions...");
        try {
            const catalog = await fetchTriggerCatalog();
            this.sources = catalog.sources;
            this.functions = catalog.functions;
            this.render();
        } catch (error) {
            this.renderState(error instanceof Error ? error.message : "Failed to load trigger catalog.");
        }
    }

    private renderState(text: string): void {
        const style = document.createElement("style");
        style.textContent = css as unknown as string;
        const state = document.createElement("div");
        state.className = "state";
        state.textContent = text;
        this.replaceChildren(style, state);
    }

    private render(): void {
        const style = document.createElement("style");
        style.textContent = css as unknown as string;
        const shell = document.createElement("cms-shell-detail");
        shell.className = "create-shell";
        const body = document.createElement("template");
        body.innerHTML = template as unknown as string;
        shell.append(body.content.cloneNode(true));
        shell.querySelector<HTMLAnchorElement>(".back")!.href = route("/admin/triggers");
        this.replaceChildren(style, shell);
        this.message = this.querySelector("[data-role='message']");
        this.saveButton = this.querySelector("[data-role='save']");
        this.populateSources();
        this.populateFunctions();
        this.bind();
        this.syncEndpointOptions();
        this.syncFunctionContract();
        this.syncExecutionOptions();
        this.syncPhaseHelp();
        this.renderConditionPickers();
        this.renderFunctionMappings();
    }

    private bind(): void {
        this.select("source").addEventListener("change", () => {
            this.syncEndpointOptions();
            this.resetEventMappings();
        });
        this.select("endpoint").addEventListener("change", () => this.resetEventMappings());
        this.select("function").addEventListener("change", () => {
            this.functionParams = {};
            this.functionBody = {};
            this.syncFunctionContract();
            this.renderFunctionMappings();
        });
        this.select("mode").addEventListener("change", () => this.syncExecutionOptions());
        this.select("phase").addEventListener("change", () => {
            this.syncPhaseHelp();
            this.resetEventMappings();
        });
        this.select("operator").addEventListener("change", () => this.syncCondition());
        this.checkbox("condition-enabled").addEventListener("change", () => this.syncCondition());
        this.querySelector("[data-role='collapse']")?.addEventListener("click", (event) =>
            this.togglePanels(event.currentTarget as HTMLButtonElement),
        );
        this.bindIdentifier();
        this.saveButton?.addEventListener("click", () => void this.save());
    }

    private bindIdentifier(): void {
        const label = this.input("label");
        const id = this.input("id");
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

    private populateSources(): void {
        const select = this.select("source");
        for (const source of this.sources) {
            select.append(option(source.id, source.label));
        }
    }

    private syncEndpointOptions(): void {
        const select = this.select("endpoint");
        const source = this.sources.find((item) => item.id === this.select("source").value);
        select.replaceChildren(
            ...(source?.endpoints ?? []).map((endpoint) =>
                option(endpoint.endpointId, `${endpoint.method} ${endpoint.meta?.name ?? endpoint.endpointId}`),
            ),
        );
    }

    private populateFunctions(): void {
        const select = this.select("function");
        for (const fn of this.functions) {
            select.append(option(fn.id, `${fn.label} (${fn.method})`));
        }
    }

    private syncFunctionContract(): void {
        const root = this.querySelector<HTMLElement>("[data-role='function-contract']");
        const fn = this.functions.find((item) => item.id === this.select("function").value);
        if (!root) {
            return;
        }
        if (!fn) {
            root.textContent = "Create a function before creating a trigger.";
            return;
        }
        const params = Object.keys(fn.params ?? {});
        root.textContent = `${params.length ? `Params: ${params.join(", ")}` : "No params"} · ${fn.body ? "Accepts a body" : "No body"}`;
    }

    private syncCondition(): void {
        const enabled = this.checkbox("condition-enabled").checked;
        const root = this.querySelector<HTMLElement>("[data-role='condition']");
        const right = this.querySelector<HTMLElement>("[data-role='right-field']");
        if (root) {
            root.hidden = !enabled;
        }
        if (right) {
            right.hidden = this.select("operator").value === "exists";
        }
        this.renderConditionPickers();
    }

    private resetEventMappings(): void {
        this.conditionLeft.value = "";
        this.conditionLeft.mode = "reference";
        this.functionParams = {};
        this.functionBody = {};
        this.renderConditionPickers();
        this.renderFunctionMappings();
    }

    private renderConditionPickers(): void {
        const references = this.eventReferences();
        this.querySelector<HTMLElement>("[data-role='condition-left']")?.replaceChildren(
            valuePicker(this.conditionLeft, references, "Choose an event value"),
        );
        this.querySelector<HTMLElement>("[data-role='condition-right']")?.replaceChildren(
            valuePicker(this.conditionRight, references, "Choose a value"),
        );
    }

    private renderFunctionMappings(): void {
        const fn = this.functions.find((item) => item.id === this.select("function").value);
        const references = this.eventReferences();
        const params: MappingTarget[] = Object.entries(fn?.params ?? {}).map(([name, shape]) => ({
            path: name,
            label: name,
            shape: shape as MappingShape,
        }));
        const body = targetsFromShape(fn?.body as MappingShape | undefined);
        this.querySelector<HTMLElement>("[data-role='function-params']")?.replaceChildren(
            mappingEditor(params, references, this.functionParams, "This function has no parameters."),
        );
        this.querySelector<HTMLElement>("[data-role='function-body']")?.replaceChildren(
            mappingEditor(body, references, this.functionBody, "This function has no request body."),
        );
    }

    private eventReferences(): ReferenceOption[] {
        const endpoint = this.selectedEndpoint();
        const references: ReferenceOption[] = [
            { value: "$request.method", label: "Request / method", shape: { type: "string" } },
            { value: "$endpoint.urn", label: "Endpoint / URN", shape: { type: "string" } },
            { value: "$endpoint.source", label: "Endpoint / source", shape: { type: "string" } },
            { value: "$endpoint.endpoint", label: "Endpoint / identifier", shape: { type: "string" } },
            {
                value: "$ctx.user.id",
                label: "Current user / id",
                shape: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
            },
            { value: "$ctx.user.role", label: "Current user / role", shape: { type: "string" } },
        ];
        for (const param of endpoint?.params ?? []) {
            references.push({
                value: `$request.params.${param.name}`,
                label: `Request parameter / ${param.name}`,
                shape: {
                    type: dataShapeType(param.type),
                    ...(param.semantic ? { semantic: param.semantic } : {}),
                },
            });
        }
        references.push(...referencesFromShape(endpoint?.body, "$request.body", "Request body"));
        if (this.select("phase").value === "response") {
            references.push({ value: "$response.status", label: "Response / status", shape: { type: "number" } });
            const output =
                endpoint?.output?.find((entry) => /^2\d\d$/.test(entry.status)) ??
                endpoint?.output?.find((entry) => entry.status === "default");
            references.push(...referencesFromShape(output?.body, "$response.body", "Response body"));
            references.push(
                ...referencesFromShape(output?.triggerBody, "$response.body", "Response body / trigger-only"),
            );
        }
        return uniqueReferences(references);
    }

    private selectedEndpoint() {
        return this.sources
            .find((item) => item.id === this.select("source").value)
            ?.endpoints.find((endpoint) => endpoint.endpointId === this.select("endpoint").value);
    }

    private syncPhaseHelp(): void {
        const help = this.querySelector<HTMLElement>("[data-role='phase-help']");
        if (!help) {
            return;
        }
        help.textContent =
            this.select("phase").value === "request"
                ? "Request triggers run before the endpoint and cannot inspect $response values."
                : "Response triggers can inspect both the request and response.";
    }

    private syncExecutionOptions(): void {
        const failure = this.select("failure");
        const asyncMode = this.select("mode").value === "async";
        const block = failure.querySelector<HTMLOptionElement>('option[value="block"]');
        if (block) {
            block.disabled = asyncMode;
        }
        if (asyncMode && failure.value === "block") {
            failure.value = "ignore";
        }
    }

    private async save(): Promise<void> {
        if (!this.saveButton) {
            return;
        }
        this.saveButton.disabled = true;
        this.setMessage("Validating trigger...", "");
        try {
            await createTriggerDefinition(this.definition(), this.checkbox("enabled").checked);
            window.location.href = route("/admin/triggers");
        } catch (error) {
            this.setMessage(error instanceof Error ? error.message : "Failed to create trigger.", "error");
            this.saveButton.disabled = false;
        }
    }

    private definition(): TriggerDefinition {
        const id = this.input("id").value.trim();
        const label = this.input("label").value.trim();
        const advancedParams = parseOptionalObject(this.textarea("params").value, "Params mapping");
        const advancedBody = parseOptionalValue(this.textarea("body").value);
        const params = advancedParams ?? mappedObject(this.functionParams);
        const body = advancedBody ?? mappedDraft(this.functionBody);
        const mode = this.select("mode").value as NonNullable<TriggerDefinition["mode"]>;
        return {
            id,
            ...(label ? { label } : {}),
            event: {
                kind: "endpoint",
                source: this.select("source").value,
                endpoint: this.select("endpoint").value,
                phase: this.select("phase").value as TriggerDefinition["event"]["phase"],
            },
            mode,
            failureMode: this.select("failure").value as NonNullable<TriggerDefinition["failureMode"]>,
            ...(this.checkbox("condition-enabled").checked ? { condition: this.condition() } : {}),
            function: {
                id: this.select("function").value,
                ...(Object.keys(params).length ? { params: params as Record<string, FunctionValue> } : {}),
                ...(body !== undefined ? { body } : {}),
            },
        };
    }

    private condition(): FunctionCondition {
        const operator = this.select("operator").value;
        const left = resolvedDraftValue(this.conditionLeft);
        if (operator === "exists") {
            return { exists: left };
        }
        return { [operator]: [left, resolvedDraftValue(this.conditionRight)] } as FunctionCondition;
    }

    private input(name: string): HTMLInputElement {
        return this.querySelector(`[data-field="${name}"]`) as HTMLInputElement;
    }
    private textarea(name: string): HTMLTextAreaElement {
        return this.querySelector(`[data-field="${name}"]`) as HTMLTextAreaElement;
    }
    private select(name: string): HTMLSelectElement {
        return this.querySelector(`[data-field="${name}"]`) as HTMLSelectElement;
    }
    private checkbox(name: string): HTMLInputElement {
        return this.input(name);
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

function option(value: string, label: string): HTMLOptionElement {
    const el = document.createElement("option");
    el.value = value;
    el.textContent = label;
    return el;
}

function parseOptionalObject(raw: string, label: string): Record<string, FunctionValue> | undefined {
    if (!raw.trim()) {
        return undefined;
    }
    try {
        const value = JSON.parse(raw) as unknown;
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error();
        }
        return value as Record<string, FunctionValue>;
    } catch {
        throw new Error(`${label} must be a JSON object.`);
    }
}

function mappedDraft(draft: Record<string, ValueDraft>): FunctionValue | undefined {
    const root = draft[""];
    if (root?.value) {
        return resolvedDraftValue(root);
    }
    const mapped = mappedObject(draft);
    return Object.keys(mapped).length ? mapped : undefined;
}

function parseOptionalValue(raw: string): FunctionValue | undefined {
    return raw.trim() ? parseValue(raw) : undefined;
}

function parseValue(raw: string): FunctionValue {
    const text = raw.trim();
    if (text.startsWith("$")) {
        return text;
    }
    try {
        return JSON.parse(text) as FunctionValue;
    } catch {
        return text;
    }
}

function identifier(value: string): string {
    const words =
        value
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .match(/[A-Za-z0-9]+/g) ?? [];
    return words.map((word) => word.toLowerCase()).join("-");
}

function dataShapeType(value: string | undefined): MappingShape["type"] {
    return value === "number" || value === "boolean" || value === "object" || value === "array" ? value : "string";
}

function uniqueReferences(references: ReferenceOption[]): ReferenceOption[] {
    const seen = new Set<string>();
    return references.filter((reference) => {
        if (seen.has(reference.value)) {
            return false;
        }
        seen.add(reference.value);
        return true;
    });
}
