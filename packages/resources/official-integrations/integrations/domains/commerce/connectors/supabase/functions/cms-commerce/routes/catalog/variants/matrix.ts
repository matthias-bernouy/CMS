import { HttpError } from "../../../core/errors.ts";
import { isRecord } from "../../../core/records.ts";
import type { JsonRecord } from "../../../core/types.ts";

type AxisValue = { key: string; label: string; value: string; position: number };
type Axis = { key: string; fieldKey?: string; label: string; position: number; values: AxisValue[] };
type Choice = { axisKey: string; valueKey: string; fieldKey?: string; axisLabel: string; valueLabel: string };

export function withVariantMatrix(body: JsonRecord): JsonRecord {
    const safeBody = Object.fromEntries(
        Object.entries(body).filter(([key]) => key !== "variants" && key !== "variantMatrix"),
    );
    if (!("variantAxes" in body)) {
        return safeBody;
    }
    const axes = normalizeAxes(body.variantAxes);
    const combinations = cartesian(axes);
    if (combinations.length > 100) {
        throw new HttpError(422, "variant axes cannot generate more than 100 combinations");
    }
    return {
        ...safeBody,
        variantAxes: axes,
        variantMatrix: combinations.map((choices, position) => ({
            key: choices.map((choice) => `${choice.axisKey}:${choice.valueKey}`).join("|"),
            title: choices.map((choice) => `${choice.axisLabel}: ${choice.valueLabel}`).join(" / "),
            options: choices.map((choice) => choice.valueLabel).join(" / "),
            status: "active",
            position,
            choices: choices.map(({ axisKey, valueKey }) => ({ axisKey, valueKey })),
        })),
    };
}

function normalizeAxes(value: unknown): Axis[] {
    if (!Array.isArray(value)) {
        throw new HttpError(422, "variantAxes must be an array");
    }
    if (value.length > 4) {
        throw new HttpError(422, "a product can have at most four variant axes");
    }
    const axes = value.map((entry, position) => normalizeAxis(entry, position));
    assertUnique(
        axes.map((axis) => axis.key),
        "variant axis keys",
    );
    return axes;
}

function normalizeAxis(value: unknown, position: number): Axis {
    if (!isRecord(value)) {
        throw new HttpError(422, `variantAxes[${position}] must be an object`);
    }
    const fieldKey = metadataKey(value.fieldKey, `variantAxes[${position}].fieldKey`);
    const label = requiredLabel(value.label ?? fieldKey, `variantAxes[${position}].label`, 120);
    const key = stableKey(value.key, fieldKey ?? label, 48, true);
    const labels = stringList(value.values);
    if (!labels.length || labels.length > 20) {
        throw new HttpError(422, `${label} must contain between one and twenty values`);
    }
    const values = labels.map((item, index) => ({
        key: stableKey(undefined, item, 64, false),
        label: requiredLabel(item, `${label} value`, 160),
        value: item,
        position: index,
    }));
    assertUnique(
        values.map((item) => item.key),
        `value keys for ${label}`,
    );
    return { key, ...(fieldKey ? { fieldKey } : {}), label, position, values };
}

function cartesian(axes: Axis[]): Choice[][] {
    if (!axes.length) {
        return [];
    }
    return axes.reduce<Choice[][]>(
        (sets, axis) =>
            sets.flatMap((set) =>
                axis.values.map((value) => [
                    ...set,
                    {
                        axisKey: axis.key,
                        valueKey: value.key,
                        ...(axis.fieldKey ? { fieldKey: axis.fieldKey } : {}),
                        axisLabel: axis.label,
                        valueLabel: value.label,
                    },
                ]),
            ),
        [[]],
    );
}

function metadataKey(value: unknown, name: string): string | undefined {
    if (value === undefined || value === null || value === "") {
        return undefined;
    }
    const key = String(value).trim();
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)) {
        throw new HttpError(422, `${name} is invalid`);
    }
    return key;
}

function stringList(value: unknown): string[] {
    const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
    return items.map((item) => String(item).trim()).filter(Boolean);
}

function requiredLabel(value: unknown, name: string, max: number): string {
    const label = typeof value === "string" ? value.trim() : "";
    if (!label) {
        throw new HttpError(422, `${name} is required`);
    }
    if (label.length > max) {
        throw new HttpError(422, `${name} is too long`);
    }
    return label;
}

function stableKey(value: unknown, label: string, max: number, startsWithLetter: boolean): string {
    const candidate = typeof value === "string" && value.trim() ? value.trim() : slug(label);
    const key = candidate.toLowerCase().slice(0, max);
    const pattern = startsWithLetter ? /^[a-z][a-z0-9_-]*$/ : /^[a-z0-9][a-z0-9_-]*$/;
    if (!pattern.test(key)) {
        throw new HttpError(422, `cannot derive a stable key from ${label}`);
    }
    return key;
}

function assertUnique(values: string[], name: string): void {
    if (new Set(values).size !== values.length) {
        throw new HttpError(422, `${name} must be unique`);
    }
}

function slug(value: string): string {
    return value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
