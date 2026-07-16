import type { CmsFunction, FunctionStep } from "@bernouy/cms-functions";
import type { DataShape, SourceEndpointAccessMode } from "@bernouy/cms-sources";

export type FunctionListItem = {
    id: string;
    label: string;
    description: string;
    method: string;
    access: SourceEndpointAccessMode;
    paramsLabel: string;
    bodyLabel: string;
    inputLabel: string;
    stepsLabel: string;
    outputLabel: string;
    returnLabel: string;
    params?: Record<string, DataShape>;
    body?: DataShape;
    paramsSample: Record<string, unknown>;
    bodySample?: unknown;
};

export type FunctionDetailItem = FunctionListItem & Pick<CmsFunction, "steps" | "output" | "return" | "ui">;
export type FunctionListResponse = FunctionListItem[];

export function toFunctionListItem(fn: CmsFunction): FunctionListItem {
    return {
        id: fn.id,
        label: fn.meta?.name ?? fn.id,
        description: fn.meta?.description ?? "",
        method: fn.method,
        access: fn.access?.mode ?? "admin",
        paramsLabel: paramsLabel(fn),
        bodyLabel: bodyLabel(fn),
        inputLabel: inputLabel(fn),
        stepsLabel: countLabel(countSteps(fn.steps), "step"),
        outputLabel: outputLabel(fn),
        returnLabel: returnLabel(fn),
        ...(fn.input?.params ? { params: fn.input.params } : {}),
        ...(fn.input?.body ? { body: fn.input.body, bodySample: sampleValue(fn.input.body) } : {}),
        paramsSample: paramsSample(fn),
    };
}

export function toFunctionDetailItem(fn: CmsFunction): FunctionDetailItem {
    return {
        ...toFunctionListItem(fn),
        steps: fn.steps,
        output: fn.output,
        ...(fn.ui ? { ui: fn.ui } : {}),
        return: fn.return,
    };
}

function paramsLabel(fn: CmsFunction): string {
    const names = Object.keys(fn.input?.params ?? {});
    return names.length ? `Params: ${names.join(", ")}` : "No params";
}

function bodyLabel(fn: CmsFunction): string {
    const body = fn.input?.body;
    if (!body) return "No body";
    if (body.type === "object") {
        const names = Object.keys(body.properties ?? {});
        return names.length ? `Body: ${names.join(", ")}` : "Body: object";
    }
    if (body.type === "array") return "Body: array";
    return `Body: ${body.type}`;
}

function inputLabel(fn: CmsFunction): string {
    const labels = [paramsLabel(fn), bodyLabel(fn)].filter(label => !label.startsWith("No "));
    return labels.length ? labels.join(" / ") : "No input";
}

function outputLabel(fn: CmsFunction): string {
    const output = fn.output ?? [];
    return output.length ? output.map(entry => entry.status).join(", ") : "No output";
}

function returnLabel(fn: CmsFunction): string {
    const status = fn.return.status ?? 200;
    return `${status}${fn.return.body === undefined ? " no body" : " body"}`;
}

function countSteps(steps: readonly FunctionStep[]): number {
    return steps.reduce((total, step) => total + 1 + ("forEach" in step ? countSteps(step.forEach.steps) : 0), 0);
}

function countLabel(count: number, singular: string): string {
    return count === 1 ? `1 ${singular}` : `${count} ${singular}s`;
}

function paramsSample(fn: CmsFunction): Record<string, unknown> {
    return Object.fromEntries(Object.entries(fn.input?.params ?? {})
        .map(([name, shape]) => [name, sampleValue(shape)]));
}

function sampleValue(shape: DataShape): unknown {
    if (shape.type === "object") {
        return Object.fromEntries(Object.entries(shape.properties ?? {})
            .map(([name, child]) => [name, sampleValue(child)]));
    }
    if (shape.type === "array") return [];
    if (shape.type === "number") return 0;
    if (shape.type === "boolean") return false;
    return "";
}
