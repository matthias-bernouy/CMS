import { valuePicker } from "../../../WorkflowEditor/mapping";
import stepTemplate from "../templates/step.html" with { type: "text" };

import { field, grid, input, select } from "./controls";
import { renderCallFields } from "./callFields";
import { referencesBefore } from "./references";
import type { AssertDraft, StepDraft, StepEditorContext } from "./types";

export function stepCard(step: StepDraft, index: number, context: StepEditorContext): HTMLElement {
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
        renderCallFields(fields, step, context);
    } else {
        renderAssertFields(fields, step, context);
    }
    card.querySelector("[data-remove]")?.addEventListener("click", (event) => {
        event.preventDefault();
        context.steps.splice(index, 1);
        context.renderSteps();
    });
    card.querySelector("[data-move='up']")?.addEventListener("click", (event) => {
        event.preventDefault();
        context.moveStep(index, -1);
    });
    card.querySelector("[data-move='down']")?.addEventListener("click", (event) => {
        event.preventDefault();
        context.moveStep(index, 1);
    });
    return card;
}

function renderAssertFields(root: HTMLElement, step: AssertDraft, context: StepEditorContext): void {
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
            context.renderSteps();
        },
    );
    const references = referencesBefore(context, context.steps.indexOf(step));
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
