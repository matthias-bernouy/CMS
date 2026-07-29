import type { DataShape } from "cms-sources/interfaces/DataShape";
import type {
    Source,
    SourceEndpoint,
    SourceMediaInventoryEffect,
    SourceProducedMediaEffect,
    SourceRemovedMediaEffect,
} from "cms-sources/interfaces/Source";
import { sourceEndpointAccessMode } from "../execution/access";
import { dataShapeAtPath } from "./parseDataShape";

type MediaEffect = SourceProducedMediaEffect | SourceRemovedMediaEffect;

export function validateSourceMediaEffects(source: Source, errors: string[]): void {
    for (const endpoint of source.endpoints) {
        const produced = endpoint.effects?.producesMedia ?? [];
        const removed = endpoint.effects?.removesMedia ?? [];
        const inventory = endpoint.effects?.mediaInventory;
        if ((produced.length || removed.length) && ["GET", "HEAD", "OPTIONS"].includes(endpoint.method)) {
            errors.push(`media effects require a mutating endpoint: "${endpoint.urn}"`);
        }
        produced.forEach((effect, index) => validateEffect(source, endpoint, effect, `producesMedia.${index}`, errors));
        removed.forEach((effect, index) => validateEffect(source, endpoint, effect, `removesMedia.${index}`, errors));
        if (inventory) {
            validateInventory(source, endpoint, inventory, errors);
        }
    }
}

function validateInventory(
    source: Source,
    owner: SourceEndpoint,
    inventory: SourceMediaInventoryEffect,
    errors: string[],
): void {
    const prefix = `invalid mediaInventory for "${owner.urn}"`;
    if (owner.method !== "GET" || owner.responseKind === "file") {
        errors.push(`${prefix}: inventory must be a GET JSON endpoint`);
    }
    validateEffect(source, owner, inventory, "mediaInventory", errors);
    if (!inventory.cursor) {
        return;
    }
    const input = owner.input?.params?.find((param) => param.name === inventory.cursor!.requestParam);
    if (!input || input.schema.type !== "string" || input.source?.from === "computed") {
        errors.push(`${prefix}: cursor requestParam must name a request string parameter`);
    }
    const cursorShapes = successShapes(owner)
        .map((shape) => dataShapeAtPath(shape, inventory.cursor!.responsePath))
        .filter((shape): shape is DataShape => Boolean(shape));
    if (!cursorShapes.some((shape) => shape.type === "string" && shape.nullable === true)) {
        errors.push(`${prefix}: cursor responsePath must be a nullable string response value`);
    }
}

function validateEffect(
    source: Source,
    owner: SourceEndpoint,
    effect: MediaEffect,
    label: string,
    errors: string[],
): void {
    const prefix = `invalid ${label} for "${owner.urn}"`;
    const target = source.endpoints.find((endpoint) => endpoint.urn.endsWith(`:${effect.targetEndpoint}`));
    if (!target) {
        errors.push(`${prefix}: unknown target endpoint "${effect.targetEndpoint}"`);
        return;
    }
    if (!isPublicImageEndpoint(target)) {
        errors.push(`${prefix}: target "${effect.targetEndpoint}" must be a public GET file/image endpoint`);
    }
    const targetParams = new Map((target.input?.params ?? []).map((param) => [param.name, param]));
    for (const param of target.input?.params ?? []) {
        if (param.required && param.source?.from !== "computed" && !effect.params[param.name]) {
            errors.push(`${prefix}: missing binding for required target parameter "${param.name}"`);
        }
    }
    for (const [name, binding] of Object.entries(effect.params)) {
        const targetParam = targetParams.get(name);
        if (!targetParam) {
            errors.push(`${prefix}: unknown target parameter "${name}"`);
            continue;
        }
        if ("requestParam" in binding) {
            validateRequestBinding(owner, binding.requestParam, targetParam.schema.type, `${prefix}.${name}`, errors);
        } else {
            validateResponseBinding(
                owner,
                effect,
                binding.responsePath,
                targetParam.schema.type,
                `${prefix}.${name}`,
                errors,
            );
        }
    }
    if ("revision" in effect && effect.revision) {
        validateResponseBinding(owner, effect, effect.revision.responsePath, "scalar", `${prefix}.revision`, errors);
    }
    if ("width" in effect && effect.width) {
        validateResponseBinding(owner, effect, effect.width.responsePath, "number", `${prefix}.width`, errors);
    }
    if ("height" in effect && effect.height) {
        validateResponseBinding(owner, effect, effect.height.responsePath, "number", `${prefix}.height`, errors);
    }
}

function validateRequestBinding(
    endpoint: SourceEndpoint,
    requestParam: string,
    expected: DataShape["type"],
    label: string,
    errors: string[],
): void {
    const param = endpoint.input?.params?.find((candidate) => candidate.name === requestParam);
    if (!param || param.source?.from === "computed" || param.schema.type !== expected) {
        errors.push(`${label}: requestParam "${requestParam}" is not a declared request ${expected} value`);
    }
}

function isPublicImageEndpoint(endpoint: SourceEndpoint): boolean {
    const mediaType = endpoint.mediaType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    return (
        endpoint.method === "GET" &&
        endpoint.responseKind === "file" &&
        (mediaType === "image/*" || mediaType.startsWith("image/")) &&
        sourceEndpointAccessMode(endpoint) === "public" &&
        !(endpoint.input?.params ?? []).some((param) => param.source?.from === "computed")
    );
}

function validateResponseBinding(
    endpoint: SourceEndpoint,
    effect: MediaEffect,
    responsePath: string,
    expected: DataShape["type"] | "scalar",
    label: string,
    errors: string[],
): void {
    if (!responsePath.trim()) {
        errors.push(`${label}: responsePath must not be empty`);
        return;
    }
    const shapes = successShapes(endpoint)
        .map((shape) => itemShape(shape, effect.itemsPath))
        .map((shape) => dataShapeAtPath(shape, responsePath))
        .filter((shape): shape is DataShape => Boolean(shape));
    const valid = shapes.some((shape) =>
        expected === "scalar"
            ? shape.type === "string" || shape.type === "number" || shape.type === "boolean"
            : shape.type === expected,
    );
    if (!valid) {
        errors.push(`${label}: responsePath "${responsePath}" is not a declared ${expected} response value`);
    }
}

function successShapes(endpoint: SourceEndpoint): Array<DataShape | undefined> {
    return (endpoint.output ?? [])
        .filter((output) => output.status === "default" || /^2\d\d$/.test(output.status))
        .map((output) => output.body);
}

function itemShape(shape: DataShape | undefined, itemsPath: string | undefined): DataShape | undefined {
    if (!itemsPath) {
        return shape;
    }
    const collection = dataShapeAtPath(shape, itemsPath);
    return collection?.type === "array" ? collection.items : undefined;
}
