import type {
    CollectionMediaAccept,
    CollectionSettingControl,
    CollectionSettingOption,
} from "cms-repository/collections/interfaces/CollectionBloc";
import type { CollectionThemeTokenType } from "cms-repository/collections/interfaces/CollectionTheme";
import type { CollectionLimits } from "../../limits";
import { array, keys, record, string, unique } from "../../values";
import { invalid } from "../../errors";

const STRING_CONTROL_KINDS = [
    "text",
    "select",
    "segmented",
    "color",
    "page-link",
    "media-picker",
    "theme-token-picker",
];
const MEDIA_ACCEPTS: CollectionMediaAccept[] = ["image", "bitmap", "svg", "video", "audio", "document"];
const THEME_TOKEN_TYPES: CollectionThemeTokenType[] = ["color", "font-family", "length", "number", "shadow", "value"];

export function parseSettingControl(
    value: unknown,
    type: "string" | "boolean" | "number" | "integer",
    path: string,
    limits: Readonly<CollectionLimits>,
): CollectionSettingControl {
    if (value === undefined) {
        if (type === "boolean") {
            return { kind: "toggle" };
        }
        return type === "number" || type === "integer" ? { kind: "number" } : { kind: "text" };
    }
    const source = record(value, path);
    const kind = string(source.kind, 32, `${path}.kind`);
    if (type === "boolean") {
        keys(source, ["kind"], path);
        if (kind !== "toggle") {
            invalid("boolean settings require a toggle control", `${path}.kind`);
        }
        return { kind: "toggle" };
    }
    if (type === "number" || type === "integer") {
        keys(source, ["kind", "step", "suffix"], path);
        if (kind !== "number" && kind !== "range") {
            invalid("numeric settings require a number or range control", `${path}.kind`);
        }
        const step = source.step === undefined ? undefined : positiveNumber(source.step, `${path}.step`);
        if (type === "integer" && step !== undefined && !Number.isSafeInteger(step)) {
            invalid("integer setting steps must be safe integers", `${path}.step`);
        }
        return {
            kind,
            ...(step === undefined ? {} : { step }),
            ...(source.suffix === undefined ? {} : { suffix: string(source.suffix, 32, `${path}.suffix`) }),
        };
    }
    if (!STRING_CONTROL_KINDS.includes(kind)) {
        invalid("unsupported string setting control", `${path}.kind`);
    }
    if (kind === "text") {
        keys(source, ["kind", "placeholder"], path);
        return { kind, ...optionalText(source.placeholder, `${path}.placeholder`) };
    }
    if (kind === "select" || kind === "segmented") {
        keys(source, ["kind", "options"], path);
        return { kind, options: parseOptions(source.options, `${path}.options`, limits) };
    }
    if (kind === "color") {
        keys(source, ["kind", "tokens", "allowCustom"], path);
        if (source.allowCustom !== undefined && typeof source.allowCustom !== "boolean") {
            invalid("must be a boolean", `${path}.allowCustom`);
        }
        return {
            kind,
            ...(source.tokens === undefined ? {} : { tokens: parseOptions(source.tokens, `${path}.tokens`, limits) }),
            ...(source.allowCustom === undefined ? {} : { allowCustom: source.allowCustom as boolean }),
        };
    }
    if (kind === "page-link") {
        keys(source, ["kind", "allowPage", "allowExternal", "allowMedia", "mediaAccept"], path);
        return {
            kind,
            ...optionalBooleans(source, path, ["allowPage", "allowExternal", "allowMedia"]),
            ...(source.mediaAccept === undefined
                ? {}
                : { mediaAccept: finiteList(source.mediaAccept, MEDIA_ACCEPTS, `${path}.mediaAccept`) }),
        };
    }
    if (kind === "media-picker") {
        keys(source, ["kind", "accept"], path);
        return {
            kind,
            ...(source.accept === undefined
                ? {}
                : { accept: finiteList(source.accept, MEDIA_ACCEPTS, `${path}.accept`) }),
        };
    }
    keys(source, ["kind", "accept"], path);
    return {
        kind: "theme-token-picker",
        ...(source.accept === undefined
            ? {}
            : { accept: finiteList(source.accept, THEME_TOKEN_TYPES, `${path}.accept`) }),
    };
}

export function settingControlValues(control: CollectionSettingControl): readonly string[] | undefined {
    return control.kind === "select" || control.kind === "segmented"
        ? control.options.map((option) => option.value)
        : undefined;
}

function parseOptions(value: unknown, path: string, limits: Readonly<CollectionLimits>): CollectionSettingOption[] {
    const values = array(value, limits.schema.maxProperties, path);
    if (values.length === 0) {
        invalid("must contain at least one option", path);
    }
    const options = values.map((value, index) => {
        const optionPath = `${path}[${index}]`;
        const source = record(value, optionPath);
        keys(source, ["value", "label", "icon"], optionPath);
        return {
            value: string(source.value, 256, `${optionPath}.value`),
            label: string(source.label, 120, `${optionPath}.label`),
            ...(source.icon === undefined ? {} : { icon: string(source.icon, 64, `${optionPath}.icon`) }),
        };
    });
    unique(
        options.map((option) => option.value),
        path,
    );
    return options;
}

function finiteList<T extends string>(value: unknown, allowed: readonly T[], path: string): T[] {
    const values = array(value, allowed.length, path).map((item, index) => {
        if (typeof item !== "string" || !allowed.includes(item as T)) {
            invalid(`must be one of ${allowed.join(", ")}`, `${path}[${index}]`);
        }
        return item as T;
    });
    unique(values, path);
    return values;
}

function optionalText(value: unknown, path: string): { placeholder?: string } {
    return value === undefined ? {} : { placeholder: string(value, 240, path) };
}

function positiveNumber(value: unknown, path: string): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        invalid("must be a positive finite number", path);
    }
    return value;
}

function optionalBooleans(
    source: Record<string, unknown>,
    path: string,
    names: readonly string[],
): Record<string, boolean> {
    return Object.fromEntries(
        names.flatMap((name) => {
            const value = source[name];
            if (value === undefined) {
                return [];
            }
            if (typeof value !== "boolean") {
                invalid("must be a boolean", `${path}.${name}`);
            }
            return [[name, value]];
        }),
    );
}
