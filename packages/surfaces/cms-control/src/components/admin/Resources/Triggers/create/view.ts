import type { FunctionCatalogSource } from "../../Functions/api";

import { route, type TriggerFunctionItem } from "../api";
import { checkbox, option, select } from "./controls";
import css from "./styles";
import { appendCreateTemplate } from "./templates";

export function renderState(host: HTMLElement, text: string): void {
    const style = document.createElement("style");
    style.textContent = css;
    const state = document.createElement("div");
    state.className = "state";
    state.textContent = text;
    host.replaceChildren(style, state);
}

export function renderShell(host: HTMLElement): void {
    const style = document.createElement("style");
    style.textContent = css;
    const shell = document.createElement("cms-shell-detail");
    shell.className = "create-shell";
    appendCreateTemplate(shell);
    shell.querySelector<HTMLAnchorElement>(".back")!.href = route("/admin/triggers");
    host.replaceChildren(style, shell);
}

export function populateSources(host: ParentNode, sources: FunctionCatalogSource[]): void {
    const sourceSelect = select(host, "source");
    for (const source of sources) {
        sourceSelect.append(option(source.id, source.label));
    }
}

export function syncEndpointOptions(host: ParentNode, sources: FunctionCatalogSource[]): void {
    const endpointSelect = select(host, "endpoint");
    const source = sources.find((item) => item.id === select(host, "source").value);
    endpointSelect.replaceChildren(
        ...(source?.endpoints ?? []).map((endpoint) =>
            option(endpoint.endpointId, `${endpoint.method} ${endpoint.meta?.name ?? endpoint.endpointId}`),
        ),
    );
}

export function populateFunctions(host: ParentNode, functions: TriggerFunctionItem[]): void {
    const functionSelect = select(host, "function");
    for (const fn of functions) {
        functionSelect.append(option(fn.id, `${fn.label} (${fn.method})`));
    }
}

export function syncFunctionContract(host: ParentNode, functions: TriggerFunctionItem[]): void {
    const root = host.querySelector<HTMLElement>("[data-role='function-contract']");
    const fn = functions.find((item) => item.id === select(host, "function").value);
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

export function syncPhaseHelp(host: ParentNode): void {
    const help = host.querySelector<HTMLElement>("[data-role='phase-help']");
    if (help) {
        help.textContent =
            select(host, "phase").value === "request"
                ? "Request triggers run before the endpoint and cannot inspect $response values."
                : "Response triggers can inspect both the request and response.";
    }
}

export function syncExecutionOptions(host: ParentNode): void {
    const failure = select(host, "failure");
    const asyncMode = select(host, "mode").value === "async";
    const block = failure.querySelector<HTMLOptionElement>('option[value="block"]');
    if (block) {
        block.disabled = asyncMode;
    }
    if (asyncMode && failure.value === "block") {
        failure.value = "ignore";
    }
}

export function syncConditionVisibility(host: ParentNode): void {
    const enabled = checkbox(host, "condition-enabled").checked;
    const root = host.querySelector<HTMLElement>("[data-role='condition']");
    const right = host.querySelector<HTMLElement>("[data-role='right-field']");
    if (root) {
        root.hidden = !enabled;
    }
    if (right) {
        right.hidden = select(host, "operator").value === "exists";
    }
}
