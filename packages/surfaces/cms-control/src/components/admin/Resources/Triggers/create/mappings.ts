import {
    mappingEditor,
    targetsFromShape,
    valuePicker,
    type MappingShape,
    type MappingTarget,
    type ValueDraft,
} from "../../WorkflowEditor/mapping";

import type { TriggerFunctionItem } from "../api";
import { select } from "./controls";
import { eventReferences } from "./references";
import type { FunctionCatalogSource } from "../../Functions/api";

export function renderConditionPickers(
    root: ParentNode,
    sources: FunctionCatalogSource[],
    left: ValueDraft,
    right: ValueDraft,
): void {
    const references = eventReferences(root, sources);
    root.querySelector<HTMLElement>("[data-role='condition-left']")?.replaceChildren(
        valuePicker(left, references, "Choose an event value"),
    );
    root.querySelector<HTMLElement>("[data-role='condition-right']")?.replaceChildren(
        valuePicker(right, references, "Choose a value"),
    );
}

export function renderFunctionMappings(
    root: ParentNode,
    sources: FunctionCatalogSource[],
    functions: TriggerFunctionItem[],
    functionParams: Record<string, ValueDraft>,
    functionBody: Record<string, ValueDraft>,
): void {
    const fn = functions.find((item) => item.id === select(root, "function").value);
    const references = eventReferences(root, sources);
    const params: MappingTarget[] = Object.entries(fn?.params ?? {}).map(([name, shape]) => ({
        path: name,
        label: name,
        shape: shape as MappingShape,
    }));
    const body = targetsFromShape(fn?.body as MappingShape | undefined);
    root.querySelector<HTMLElement>("[data-role='function-params']")?.replaceChildren(
        mappingEditor(params, references, functionParams, "This function has no parameters."),
    );
    root.querySelector<HTMLElement>("[data-role='function-body']")?.replaceChildren(
        mappingEditor(body, references, functionBody, "This function has no request body."),
    );
}
