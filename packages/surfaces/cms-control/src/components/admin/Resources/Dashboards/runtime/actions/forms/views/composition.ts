import type { DashboardFormOperation } from "@bernouy/cms-dashboards";
import type { RenderContext } from "../../../../domain";
import { sourceUrl } from "../../../source";
import markup from "cms-control/static/admin/_content/sources/_runtime/forms/index.html" with { type: "text" };

let sequence = 0;
export function formId(): string {
    return `dashboard-form-${++sequence}`;
}
export function formPart<T extends HTMLElement>(name: string): T {
    const template = document.createElement("template");
    template.innerHTML = markup as unknown as string;
    return template.content
        .querySelector<HTMLTemplateElement>(`[data-form-part="${name}"]`)!
        .content.firstElementChild!.cloneNode(true) as T;
}
export function configureForm(form: HTMLFormElement, operation: DashboardFormOperation, context: RenderContext): void {
    const sourceId = operation.sourceId ?? context.dashboard.source;
    const group = (context.groups ?? [context.group]).find((candidate) => candidate.source.id === sourceId);
    const endpoint = group?.endpoints.find((candidate) => candidate.endpointId === operation.endpoint);
    if (!endpoint || !["POST", "PUT", "PATCH", "DELETE"].includes(endpoint.method.toUpperCase())) {
        throw new Error(`Form endpoint ${operation.endpoint} must declare a request-body method.`);
    }
    form.setAttribute("id", formId());
    form.setAttribute("cms-source", `${sourceUrl(sourceId, operation, {}).href} as operationResult`);
    form.setAttribute("cms-source-method", endpoint.method);
    const fields = [...(operation.hiddenFields ?? [])];
    for (const field of fields) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = field.name;
        input.setAttribute("cms-form-value-type", field.type);
        input.required = field.empty !== "omit";
        if (field.empty === "omit") {
            input.setAttribute("cms-form-empty", "omit");
        }
        const value = field.value;
        input.setAttribute("value", technicalValue(value));
        form.prepend(input);
    }
}
export function submissionName(path: string, prefix?: string): string {
    const parts = path.replace(/\[([^\]]*)\]/g, ".$1").split(".");
    const root = prefix ? submissionName(prefix) : parts.shift()!;
    return root + parts.map((part) => `[${part}]`).join("");
}

function technicalValue(value: string | number | boolean): string {
    if (typeof value !== "string" || !value.startsWith("$")) {
        return String(value);
    }
    const roots: Record<string, string> = {
        resource: "detailResource",
        selection: "detailSelection",
        row: "detailRow",
    };
    const match = /^\$(resource|selection|row)(\..+)?$/.exec(value);
    if (!match) {
        throw new Error("A technical field must use a stable resource or selection value.");
    }
    return `{{ ${roots[match[1]!]}${match[2] ?? ""} }}`;
}
