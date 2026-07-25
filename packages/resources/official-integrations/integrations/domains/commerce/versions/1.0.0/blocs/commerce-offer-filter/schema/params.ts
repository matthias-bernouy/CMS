import { snapRangeValue } from "../range/values";
import { filterControls, filterableFields, legacyFilterParam, numericRange } from "./helpers";

export function prepareSchemaFilterParams(host, schema) {
    if (typeof location === "undefined" || typeof history === "undefined") {
        return;
    }
    const params = new URLSearchParams(location.search);
    const migrated = migrateLegacyFilterParams(params, schema);
    const canonicalized = canonicalizeNumericFilterParams(params, schema);
    const changed = migrated || canonicalized;
    if (!changed) {
        return;
    }
    const query = params.toString();
    history.replaceState(history.state, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
    queueMicrotask(() => host.ownerDocument.dispatchEvent(new Event("cms-params:change")));
}

function migrateLegacyFilterParams(params, schema) {
    const candidates = new Map();
    for (const field of filterableFields(schema)) {
        for (const control of filterControls(field)) {
            const legacy = legacyFilterParam(field.key, control.operator);
            const targets = candidates.get(legacy) || new Set();
            targets.add(control.param);
            candidates.set(legacy, targets);
        }
    }
    let changed = false;
    for (const [legacy, targets] of candidates) {
        if (!params.has(legacy) || targets.size !== 1) {
            continue;
        }
        const [current] = targets;
        if (current === legacy) {
            continue;
        }
        if (!params.has(current)) {
            params.set(current, params.get(legacy) || "");
        }
        params.delete(legacy);
        changed = true;
    }
    return changed;
}

function canonicalizeNumericFilterParams(params, schema) {
    let changed = false;
    for (const field of filterableFields(schema)) {
        const range = numericRange(field);
        if (!range) {
            continue;
        }
        const controls = new Map(filterControls(field).map((control) => [control.operator, control.param]));
        const minimumParam = controls.get("gte");
        const maximumParam = controls.get("lte");
        if (!minimumParam || !maximumParam) {
            continue;
        }
        const maximum = readRangeValue(params, maximumParam, range, range.maximum);
        const minimum = Math.min(readRangeValue(params, minimumParam, range, range.minimum), maximum);
        changed = writeRangeValue(params, minimumParam, minimum, range.minimum) || changed;
        changed = writeRangeValue(params, maximumParam, maximum, range.maximum) || changed;
    }
    return changed;
}

function readRangeValue(params, name, range, fallback) {
    const raw = params.get(name);
    const value = raw === null || raw.trim() === "" ? Number.NaN : Number(raw);
    return snapRangeValue(value, range.minimum, range.maximum, range.step, fallback);
}

function writeRangeValue(params, name, value, boundary) {
    if (value === boundary) {
        const existed = params.has(name);
        params.delete(name);
        return existed;
    }
    const canonical = String(value);
    if (params.get(name) === canonical) {
        return false;
    }
    params.set(name, canonical);
    return true;
}
