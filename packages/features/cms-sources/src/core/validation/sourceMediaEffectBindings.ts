import type {
    SourceEndpoint,
    SourceProducedMediaEffect,
    SourceRemovedMediaEffect,
} from "cms-sources/interfaces/Source";
import { parseUrn } from "cms-sources/core/system/urn";
import { readBoundedJson } from "cms-sources/core/response-projection/readBoundedJson";
import { dataValueAtPath } from "./parseDataShape";

const MAX_MEDIA_EFFECT_RESPONSE_BYTES = 64 * 1024;
const MAX_MEDIA_EFFECT_ITEMS = 1_000;

export type SourceMediaIdentityValue = string | number | boolean;

export type ResolvedSourceMediaEffect = Readonly<{
    action: "produce" | "remove";
    sourceId: string;
    targetEndpoint: string;
    params: Readonly<Record<string, SourceMediaIdentityValue>>;
    revision?: SourceMediaIdentityValue;
    width?: number;
    height?: number;
    preset?: string;
}>;

export type ResolvedSourceMediaInventoryPage = Readonly<{
    items: readonly ResolvedSourceMediaEffect[];
    nextCursor?: string;
}>;

export async function resolveSourceMediaEffects(
    endpoint: SourceEndpoint,
    response: Response,
    request?: Request,
): Promise<ResolvedSourceMediaEffect[]> {
    const produces = endpoint.effects?.producesMedia ?? [];
    const removes = endpoint.effects?.removesMedia ?? [];
    if (!response.ok || (!produces.length && !removes.length)) {
        return [];
    }
    const parsed = await readBoundedJson(response.clone().body, MAX_MEDIA_EFFECT_RESPONSE_BYTES);
    if (!parsed.ok) {
        return [];
    }
    const sourceId = parseUrn(endpoint.urn)?.source;
    if (!sourceId) {
        return [];
    }
    return [
        ...resolveEffects(sourceId, parsed.value, removes, "remove", request),
        ...resolveEffects(sourceId, parsed.value, produces, "produce", request),
    ];
}

export async function resolveSourceMediaInventoryPage(
    endpoint: SourceEndpoint,
    response: Response,
): Promise<ResolvedSourceMediaInventoryPage | null> {
    const inventory = endpoint.effects?.mediaInventory;
    if (!inventory || !response.ok) {
        return null;
    }
    const parsed = await readBoundedJson(response.clone().body, MAX_MEDIA_EFFECT_RESPONSE_BYTES);
    const sourceId = parseUrn(endpoint.urn)?.source;
    if (!parsed.ok || !sourceId) {
        return null;
    }
    const items = resolveEffects(sourceId, parsed.value, [inventory], "produce");
    const cursor = inventory.cursor ? dataValueAtPath(parsed.value, inventory.cursor.responsePath) : null;
    return {
        items,
        ...(typeof cursor === "string" && cursor.length > 0 ? { nextCursor: cursor } : {}),
    };
}

function resolveEffects(
    sourceId: string,
    payload: unknown,
    effects: readonly (SourceProducedMediaEffect | SourceRemovedMediaEffect)[],
    action: ResolvedSourceMediaEffect["action"],
    request?: Request,
): ResolvedSourceMediaEffect[] {
    const resolved: ResolvedSourceMediaEffect[] = [];
    for (const effect of effects) {
        const items = effect.itemsPath ? dataValueAtPath(payload, effect.itemsPath) : [payload];
        const candidates = effect.itemsPath && Array.isArray(items) ? items.slice(0, MAX_MEDIA_EFFECT_ITEMS) : items;
        if (!Array.isArray(candidates)) {
            continue;
        }
        for (const item of candidates) {
            const value = resolveOne(sourceId, item, effect, action, request);
            if (value) {
                resolved.push(value);
            }
        }
    }
    return resolved;
}

function resolveOne(
    sourceId: string,
    item: unknown,
    effect: SourceProducedMediaEffect | SourceRemovedMediaEffect,
    action: ResolvedSourceMediaEffect["action"],
    request?: Request,
): ResolvedSourceMediaEffect | null {
    const params: Record<string, SourceMediaIdentityValue> = {};
    for (const [name, binding] of Object.entries(effect.params)) {
        const value = scalar(
            "requestParam" in binding
                ? request && new URL(request.url).searchParams.get(binding.requestParam)
                : dataValueAtPath(item, binding.responsePath),
        );
        if (value === null) {
            return null;
        }
        params[name] = value;
    }
    if (!("revision" in effect)) {
        return { action, sourceId, targetEndpoint: effect.targetEndpoint, params };
    }
    const revision = effect.revision ? scalar(dataValueAtPath(item, effect.revision.responsePath)) : null;
    const width = positiveIntegerAt(item, effect.width?.responsePath);
    const height = positiveIntegerAt(item, effect.height?.responsePath);
    return {
        action,
        sourceId,
        targetEndpoint: effect.targetEndpoint,
        params,
        ...(revision !== null ? { revision } : {}),
        ...(width !== null ? { width } : {}),
        ...(height !== null ? { height } : {}),
        ...(effect.preset ? { preset: effect.preset } : {}),
    };
}

function scalar(value: unknown): SourceMediaIdentityValue | null {
    if (typeof value === "string") {
        return value.trim() ? value : null;
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }
    return typeof value === "boolean" ? value : null;
}

function positiveIntegerAt(value: unknown, path: string | undefined): number | null {
    if (!path) {
        return null;
    }
    const result = dataValueAtPath(value, path);
    return Number.isSafeInteger(result) && Number(result) > 0 ? Number(result) : null;
}
