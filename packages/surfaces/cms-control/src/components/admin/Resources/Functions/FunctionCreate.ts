import type { CmsFunction, FunctionCondition, FunctionStep, FunctionValue } from "@bernouy/cms-functions";
import "cms-control/components/admin/ShellDetail/ShellDetail";
import { createFunctionDefinition, fetchFunctionCatalog, route, type FunctionCatalogSource } from "./api";
import css from "./create.css" with { type: "text" };
import template from "./create.template.html" with { type: "text" };
import stepTemplate from "./step.template.html" with { type: "text" };
import {
    mappedObject,
    mappingEditor,
    referencesFromShape,
    resolvedDraftValue,
    targetsFromShape,
    valuePicker,
    type MappingTarget,
    type ReferenceOption,
    type ValueDraft,
} from "../WorkflowEditor/mapping";
import {
    objectShapeFromFields,
    paramsFromFields,
    schemaFieldsEditor,
    type SchemaFieldDraft,
} from "../WorkflowEditor/schemaFields";

type CallDraft = {
    kind: "call";
    id: string;
    source: string;
    endpoint: string;
    params: Record<string, ValueDraft>;
    body: Record<string, ValueDraft>;
};

type AssertDraft = {
    kind: "assert";
    operator: "equals" | "notEquals" | "exists" | "gt" | "gte" | "lt" | "lte" | "in";
    left: ValueDraft;
    right: ValueDraft;
    status: string;
    error: string;
};

type StepDraft = CallDraft | AssertDraft;

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
        const style = document.createElement("style");
        style.textContent = css as unknown as string;
        if (state) {
            const message = document.createElement("div");
            message.className = "state";
            message.textContent = state;
            this.replaceChildren(style, message);
            return;
        }

        const shell = document.createElement("cms-shell-detail");
        shell.className = "create-shell";
        const body = document.createElement("template");
        body.innerHTML = template as unknown as string;
        shell.append(body.content.cloneNode(true));

        shell.querySelector<HTMLAnchorElement>(".back")!.href = route("/admin/functions");
        this.replaceChildren(style, shell);
        this.stepsRoot = this.querySelector("[data-role='steps']");
        this.message = this.querySelector("[data-role='message']");
        this.saveButton = this.querySelector("[data-role='save']");
        this.querySelector("[data-role='add-call']")?.addEventListener("click", () => this.addCall());
        this.querySelector("[data-role='add-assert']")?.addEventListener("click", () => this.addAssert());
        this.querySelector("[data-role='collapse']")?.addEventListener("click", (event) =>
            this.togglePanels(event.currentTarget as HTMLButtonElement),
        );
        this.bindGuidance();
        this.saveButton?.addEventListener("click", () => void this.save());
        this.renderInputSchemas();
        this.renderSteps();
        this.renderReturnPicker();
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

    private addCall(): void {
        const source = this.catalog[0];
        this.steps.push({
            kind: "call",
            id: `step${this.steps.length + 1}`,
            source: source?.id ?? "",
            endpoint: source?.endpoints[0]?.endpointId ?? "",
            params: {},
            body: {},
        });
        this.renderSteps();
    }

    private addAssert(): void {
        this.steps.push({
            kind: "assert",
            operator: "equals",
            left: { mode: "reference", value: "" },
            right: { mode: "literal", value: "ready" },
            status: "403",
            error: "Condition failed",
        });
        this.renderSteps();
    }

    private renderSteps(): void {
        if (!this.stepsRoot) {
            return;
        }
        this.stepsRoot.replaceChildren(...this.steps.map((step, index) => this.stepCard(step, index)));
        const empty = this.querySelector<HTMLElement>("[data-role='steps-empty']");
        if (empty) {
            empty.hidden = this.steps.length > 0;
        }
        this.renderReturnPicker();
    }

    private renderInputSchemas(): void {
        const paramsRoot = this.querySelector<HTMLElement>("[data-role='params-schema']");
        const bodyRoot = this.querySelector<HTMLElement>("[data-role='body-schema']");
        paramsRoot?.replaceChildren(
            schemaFieldsEditor(
                this.paramsFields,
                () => {
                    this.renderInputSchemas();
                    this.renderSteps();
                },
                false,
            ),
        );
        bodyRoot?.replaceChildren(
            schemaFieldsEditor(this.bodyFields, () => {
                this.renderInputSchemas();
                this.renderSteps();
            }),
        );
    }

    private stepCard(step: StepDraft, index: number): HTMLElement {
        const card = document.createElement("details");
        card.className = "step-card";
        card.open = true;
        const body = document.createElement("template");
        body.innerHTML = stepTemplate as unknown as string;
        card.append(body.content.cloneNode(true));
        card.querySelector<HTMLElement>("[data-role='kind']")!.textContent = step.kind === "call" ? "CALL" : "RULE";
        card.querySelector<HTMLElement>("[data-role='title']")!.textContent =
            step.kind === "call" ? step.id || `Step ${index + 1}` : `Business rule ${index + 1}`;
        card.querySelector<HTMLElement>("[data-role='subtitle']")!.textContent =
            step.kind === "call"
                ? `${step.source || "Choose a source"}.${step.endpoint || "endpoint"}`
                : "Execution stops when this condition fails";
        const fields = card.querySelector<HTMLElement>(".step-fields")!;
        if (step.kind === "call") {
            this.renderCallFields(fields, step);
        } else {
            this.renderAssertFields(fields, step);
        }
        card.querySelector("[data-remove]")?.addEventListener("click", (event) => {
            event.preventDefault();
            this.steps.splice(index, 1);
            this.renderSteps();
        });
        card.querySelector("[data-move='up']")?.addEventListener("click", (event) => {
            event.preventDefault();
            this.move(index, -1);
        });
        card.querySelector("[data-move='down']")?.addEventListener("click", (event) => {
            event.preventDefault();
            this.move(index, 1);
        });
        return card;
    }

    private renderCallFields(root: HTMLElement, step: CallDraft): void {
        const id = input(step.id, (value) => (step.id = value));
        const source = select(
            this.catalog.map((item) => [item.id, item.label]),
            step.source,
            (value) => {
                step.source = value;
                step.endpoint = this.catalog.find((item) => item.id === value)?.endpoints[0]?.endpointId ?? "";
                step.params = {};
                step.body = {};
                this.renderSteps();
            },
        );
        const endpoints = this.catalog.find((item) => item.id === step.source)?.endpoints ?? [];
        const endpoint = select(
            endpoints.map((item) => [item.endpointId, `${item.method} ${item.meta?.name ?? item.endpointId}`]),
            step.endpoint,
            (value) => {
                step.endpoint = value;
                step.params = {};
                step.body = {};
                this.renderSteps();
            },
        );
        const contract = endpoints.find((item) => item.endpointId === step.endpoint);
        const references = this.referencesBefore(this.steps.indexOf(step));
        const paramTargets: MappingTarget[] = (contract?.params ?? []).map((param) => ({
            path: param.name,
            label: param.name,
            required: param.required,
            shape: {
                type: dataShapeType(param.type),
                ...(param.semantic ? { semantic: param.semantic } : {}),
            },
        }));
        const bodyTargets = targetsFromShape(contract?.body);
        root.append(
            grid(
                field("Step identifier", id),
                field("Source", source),
                field("Endpoint", endpoint),
                mappingGroup(
                    "Parameter mapping",
                    mappingEditor(paramTargets, references, step.params, "This endpoint has no request parameters."),
                ),
                mappingGroup(
                    "Body mapping",
                    mappingEditor(bodyTargets, references, step.body, "This endpoint has no request body."),
                ),
            ),
        );
    }

    private renderAssertFields(root: HTMLElement, step: AssertDraft): void {
        const operator = select(
            [
                ["equals", "Equals"],
                ["notEquals", "Not equals"],
                ["exists", "Exists"],
                ["in", "In"],
                ["gt", "Greater than"],
                ["gte", "Greater or equal"],
                ["lt", "Less than"],
                ["lte", "Less or equal"],
            ],
            step.operator,
            (value) => {
                step.operator = value as AssertDraft["operator"];
                this.renderSteps();
            },
        );
        const references = this.referencesBefore(this.steps.indexOf(step));
        const children = [field("Operator", operator), field("Value to inspect", valuePicker(step.left, references))];
        if (step.operator !== "exists") {
            children.push(field("Expected value", valuePicker(step.right, references)));
        }
        children.push(
            field(
                "Failure status",
                input(step.status, (value) => (step.status = value), "403", "number"),
            ),
        );
        children.push(
            field(
                "Failure message",
                input(step.error, (value) => (step.error = value), "Condition failed"),
            ),
        );
        root.append(grid(...children));
    }

    private renderReturnPicker(): void {
        const root = this.querySelector<HTMLElement>("[data-role='return-picker']");
        root?.replaceChildren(
            valuePicker(this.returnValue, this.referencesBefore(this.steps.length), "No response body"),
        );
    }

    private referencesBefore(stepIndex: number): ReferenceOption[] {
        const params = paramsFromFields(this.paramsFields);
        const body = objectShapeFromFields(this.bodyFields);
        const references: ReferenceOption[] = [
            ...Object.entries(params).flatMap(([name, shape]) =>
                referencesFromShape(shape, `$input.params.${name}`, `Input parameter / ${name}`),
            ),
            ...referencesFromShape(body, "$input.body", "Input body"),
            {
                value: "$ctx.user.id",
                label: "Current user / id",
                shape: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
            },
            { value: "$ctx.user.role", label: "Current user / role", shape: { type: "string" } },
        ];
        this.steps.slice(0, stepIndex).forEach((step) => {
            if (step.kind !== "call") {
                return;
            }
            const endpoint = this.endpointContract(step);
            const output =
                endpoint?.output?.find((entry) => /^2\d\d$/.test(entry.status))?.body ??
                endpoint?.output?.find((entry) => entry.status === "default")?.body;
            references.push(...referencesFromShape(output, `$steps.${step.id}`, `Step ${step.id}`));
        });
        return references;
    }

    private endpointContract(step: CallDraft) {
        return this.catalog
            .find((source) => source.id === step.source)
            ?.endpoints.find((endpoint) => endpoint.endpointId === step.endpoint);
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
            const definition = this.definition();
            const created = await createFunctionDefinition(definition);
            window.location.href = route(`/admin/functions/detail?id=${encodeURIComponent(created.id)}`);
        } catch (error) {
            this.setMessage(error instanceof Error ? error.message : "Failed to create function.", "error");
            this.saveButton.disabled = false;
        }
    }

    private definition(): CmsFunction {
        const id = value(this, "id").trim();
        const name = value(this, "name").trim();
        const description = value(this, "description").trim();
        const advancedParams = parseOptional(value(this, "params"), "Params schema");
        const advancedBody = parseOptional(value(this, "body"), "Body schema");
        const params = advancedParams ?? paramsFromFields(this.paramsFields);
        const body = advancedBody ?? objectShapeFromFields(this.bodyFields);
        const advancedOutput = parseOptional(value(this, "output"), "Output contract");
        const returnBody = this.returnValue.value ? resolvedDraftValue(this.returnValue) : undefined;
        const returnShape = this.referencesBefore(this.steps.length).find(
            (reference) => reference.value === this.returnValue.value,
        )?.shape;
        const returnStatus = Number(value(this, "return-status") || 200);
        const output =
            advancedOutput ?? (returnShape ? [{ status: String(returnStatus), body: returnShape }] : undefined);
        const definition: CmsFunction = {
            id,
            method: value(this, "method") as CmsFunction["method"],
            access: { mode: value(this, "access") as NonNullable<CmsFunction["access"]>["mode"] },
            meta: { name: name || id, ...(description ? { description } : {}) },
            input: {
                ...(Object.keys(params as Record<string, unknown>).length
                    ? { params: params as NonNullable<CmsFunction["input"]>["params"] }
                    : {}),
                ...(body !== undefined ? { body: body as NonNullable<CmsFunction["input"]>["body"] } : {}),
            },
            ...(output !== undefined ? { output: output as CmsFunction["output"] } : {}),
            steps: this.steps.map((step) => buildStep(step)),
            return: {
                status: returnStatus,
                ...(returnBody !== undefined ? { body: returnBody } : {}),
            },
        };
        return definition;
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

function buildStep(step: StepDraft): FunctionStep {
    if (step.kind === "call") {
        const params = mappedObject(step.params);
        const body = mappedDraft(step.body);
        return {
            id: step.id,
            call: {
                source: step.source,
                endpoint: step.endpoint,
                ...(Object.keys(params).length ? { params: params as Record<string, FunctionValue> } : {}),
                ...(body !== undefined ? { body } : {}),
            },
        };
    }
    const left = resolvedDraftValue(step.left);
    const condition =
        step.operator === "exists"
            ? { exists: left }
            : ({ [step.operator]: [left, resolvedDraftValue(step.right)] } as FunctionCondition);
    return {
        assert: {
            condition,
            failure: { status: Number(step.status || 403), error: step.error || "Condition failed" },
        },
    };
}

function mappedDraft(draft: Record<string, ValueDraft>): FunctionValue | undefined {
    const root = draft[""];
    if (root?.value) {
        return resolvedDraftValue(root);
    }
    const mapped = mappedObject(draft);
    return Object.keys(mapped).length ? mapped : undefined;
}

function value(root: ParentNode, fieldName: string): string {
    return (
        root.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[data-field="${fieldName}"]`)
            ?.value ?? ""
    );
}

function parseOptional(raw: string, label: string): unknown {
    return raw.trim() ? parseJson(raw, label) : undefined;
}

function parseJson(raw: string, label: string): unknown {
    try {
        return JSON.parse(raw);
    } catch {
        throw new Error(`${label} is not valid JSON.`);
    }
}

function field(labelText: string, control: HTMLElement): HTMLElement {
    const label = document.createElement("label");
    label.append(document.createTextNode(labelText), control);
    return label;
}

function mappingGroup(title: string, editor: HTMLElement): HTMLElement {
    const group = document.createElement("div");
    group.className = "mapping-group";
    const heading = document.createElement("strong");
    heading.textContent = title;
    group.append(heading, editor);
    return group;
}

function grid(...children: HTMLElement[]): HTMLElement {
    const el = document.createElement("div");
    el.className = "grid";
    el.append(...children);
    return el;
}

function input(current: string, onChange: (value: string) => void, placeholder = "", type = "text"): HTMLInputElement {
    const el = document.createElement("input");
    el.type = type;
    el.value = current;
    el.placeholder = placeholder;
    el.addEventListener("input", () => onChange(el.value));
    return el;
}

function select(
    options: Array<[string, string]>,
    current: string,
    onChange: (value: string) => void,
): HTMLSelectElement {
    const el = document.createElement("select");
    for (const [optionValue, label] of options) {
        const option = document.createElement("option");
        option.value = optionValue;
        option.textContent = label;
        el.append(option);
    }
    el.value = current;
    el.addEventListener("change", () => onChange(el.value));
    return el;
}

function identifier(value: string): string {
    const words =
        value
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .match(/[A-Za-z0-9]+/g) ?? [];
    return words.map((word, index) => (index ? word[0]?.toUpperCase() + word.slice(1) : word.toLowerCase())).join("");
}

function dataShapeType(value: string | undefined): "string" | "number" | "boolean" | "object" | "array" {
    return value === "number" || value === "boolean" || value === "object" || value === "array" ? value : "string";
}
