import type { FunctionDetail } from "../contracts";
import { button, detailSection, div, keyValues, pre, schemaBlock } from "../dom";
import { executeFields } from "../create/fields";
import type { FunctionDraft } from "../types";

export function headerActions(): HTMLElement {
    const wrap = div("header-actions");
    wrap.slot = "actions";
    const reset = button("Reset draft", "secondary");
    const run = button("Run", "primary");
    reset.dataset.role = "reset";
    run.dataset.role = "run";
    wrap.append(reset, run);
    return wrap;
}

export function inputsSection(
    detail: FunctionDetail,
    draft: FunctionDraft,
    onInputChange: (path?: string) => void,
): HTMLElement {
    const section = detailSection("main", "Inputs");
    section.append(executeFields(detail, draft, onInputChange));
    return section;
}

export function resultSection(): HTMLElement {
    const section = detailSection("main", "Result");
    const status = div("status", "Not executed");
    const message = div("result-message empty", "Run the function to see its result.");
    const raw = document.createElement("details");
    status.dataset.role = "result-status";
    message.dataset.role = "result-message";
    raw.className = "raw-result";
    raw.append(summary("Raw response"), pre(""));
    raw.querySelector("pre")!.dataset.role = "result-body";
    section.append(div("result-header", status), message, raw);
    return section;
}

export function functionSummarySection(detail: FunctionDetail): HTMLElement {
    const section = detailSection("aside", "Function");
    section.append(
        keyValues([
            ["Id", detail.id],
            ["Method", detail.method],
            ["Access", detail.access],
            ["Input", detail.inputLabel],
            ["Steps", detail.stepsLabel],
            ["Return", detail.returnLabel],
        ]),
    );
    return section;
}

export function contractSection(detail: FunctionDetail): HTMLElement {
    const section = detailSection("aside", "Contract");
    const details = document.createElement("details");
    details.append(
        summary("Schemas"),
        schemaBlock("Params", detail.params ?? null),
        schemaBlock("Body", detail.body ?? null),
        schemaBlock("Output", detail.output ?? null),
    );
    section.append(details);
    return section;
}

function summary(text: string): HTMLElement {
    const element = document.createElement("summary");
    element.textContent = text;
    return element;
}
