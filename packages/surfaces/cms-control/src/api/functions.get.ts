import type { CmsFunction, FunctionStep } from "@bernouy/cms-functions";
import type { SourceEndpointAccessMode } from "@bernouy/cms-sources";
import type { ControlCms } from "cms-control/ControlCms";

export type FunctionListItem = {
    id: string;
    label: string;
    description: string;
    method: string;
    access: SourceEndpointAccessMode;
    paramsLabel: string;
    bodyLabel: string;
    stepsLabel: string;
    outputLabel: string;
    returnLabel: string;
};

export type FunctionListResponse = FunctionListItem[];

export default async function listFunctions(_req: Request, cms: ControlCms): Promise<Response> {
    const repository = cms.functions;
    if (!repository) return new Response("functions not configured", { status: 501 });

    const functions = await repository.getAllFunctions();
    functions.sort((left, right) => left.id.localeCompare(right.id));
    return Response.json(functions.map(toListItem) satisfies FunctionListResponse);
}

function toListItem(fn: CmsFunction): FunctionListItem {
    return {
        id: fn.id,
        label: fn.meta?.name ?? fn.id,
        description: fn.meta?.description ?? "",
        method: fn.method,
        access: fn.access?.mode ?? "admin",
        paramsLabel: paramsLabel(fn),
        bodyLabel: fn.input?.body ? "Body" : "No body",
        stepsLabel: countLabel(countSteps(fn.steps), "step"),
        outputLabel: outputLabel(fn),
        returnLabel: returnLabel(fn),
    };
}

function paramsLabel(fn: CmsFunction): string {
    const count = Object.keys(fn.input?.params ?? {}).length;
    return count ? countLabel(count, "param") : "No params";
}

function outputLabel(fn: CmsFunction): string {
    const output = fn.output ?? [];
    if (!output.length) return "No output";
    return output.map(entry => entry.status).join(", ");
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
