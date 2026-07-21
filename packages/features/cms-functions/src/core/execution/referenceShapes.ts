import { dataShapeAtPath, makeEndpointUrn, type DataShape } from "@bernouy/cms-sources";
import { CMS_IDENTITY_AUTHORITY } from "@bernouy/cms-identities";
import type { CmsFunction, FunctionCall, FunctionForEach, FunctionStep } from "../../interfaces/FunctionDefinition";
import type { ExecuteFunctionOptions } from "../executeFunction";

export async function referenceShape(
    definition: CmsFunction,
    reference: string,
    call: FunctionCall,
    options: ExecuteFunctionOptions,
): Promise<DataShape | undefined> {
    if (reference === "$ctx.user.id") {
        return { type: "string", semantic: { kind: "user-id", authority: CMS_IDENTITY_AUTHORITY } };
    }
    if (reference.startsWith("$input.params.")) {
        const [name, ...path] = reference.slice("$input.params.".length).split(".");
        return shapeAt(name ? definition.input?.params?.[name] : undefined, path);
    }
    if (reference === "$input.body") {
        return definition.input?.body;
    }
    if (reference.startsWith("$input.body.")) {
        return shapeAt(definition.input?.body, reference.slice("$input.body.".length).split("."));
    }
    if (reference.startsWith("$steps.")) {
        const [stepId, ...path] = reference.slice("$steps.".length).split(".");
        const step = stepId ? findStep(definition.steps, stepId) : undefined;
        if (!step || !("call" in step)) {
            return undefined;
        }
        const endpoint = await options.sources.getEndpoint(makeEndpointUrn(step.call.source, step.call.endpoint));
        const output = endpoint?.output?.find((response) => response.status.startsWith("2") && response.body)?.body;
        return shapeAt(output, path);
    }
    if (reference === "$item" || reference.startsWith("$item.")) {
        const loop = findEnclosingForEach(definition.steps, call);
        if (!loop || typeof loop.items !== "string" || !loop.items.startsWith("$")) {
            return undefined;
        }
        const collection = await referenceShape(definition, loop.items, call, options);
        const item = collection?.type === "array" ? collection.items : undefined;
        return reference === "$item" ? item : shapeAt(item, reference.slice("$item.".length).split("."));
    }
    return undefined;
}

function shapeAt(shape: DataShape | undefined, path: readonly string[]): DataShape | undefined {
    return dataShapeAtPath(shape, path, { implicitArrayItems: true });
}

function findEnclosingForEach(steps: FunctionStep[], call: FunctionCall): FunctionForEach | undefined {
    for (const step of steps) {
        if (!("forEach" in step)) {
            continue;
        }
        if (containsCall(step.forEach.steps, call) || containsCall(step.forEach.onError ?? [], call)) {
            return step.forEach;
        }
    }
    return undefined;
}

function containsCall(steps: FunctionStep[], call: FunctionCall): boolean {
    for (const step of steps) {
        if ("call" in step && step.call === call) {
            return true;
        }
        if (
            "forEach" in step &&
            (containsCall(step.forEach.steps, call) || containsCall(step.forEach.onError ?? [], call))
        ) {
            return true;
        }
    }
    return false;
}

function findStep(steps: FunctionStep[], id: string): FunctionStep | undefined {
    for (const step of steps) {
        if ("id" in step && step.id === id) {
            return step;
        }
        if ("forEach" in step) {
            const nested = findStep(step.forEach.steps, id);
            if (nested) {
                return nested;
            }
        }
    }
    return undefined;
}
