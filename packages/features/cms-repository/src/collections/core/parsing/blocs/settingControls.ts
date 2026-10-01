import type {
    CollectionEndpointMethod,
    CollectionMediaAccept,
    CollectionSettingControl,
    CollectionSettingOption,
} from "cms-repository/collections/interfaces/CollectionBloc";
import type { CollectionLimits } from "../../limits";
import { array, integer, keys, record, string, unique } from "../../values";
import { invalid } from "../../errors";

const CONTROL_KINDS = ["text", "textarea", "select", "segmented", "color", "page-link", "endpoint-picker"];
const MEDIA_ACCEPTS: CollectionMediaAccept[] = ["image", "bitmap", "svg", "video", "audio", "document"];
const ENDPOINT_METHODS: CollectionEndpointMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export function parseSettingControl(
    value: unknown,
    type: "string" | "boolean",
    path: string,
    limits: Readonly<CollectionLimits>,
): CollectionSettingControl {
    if (value === undefined) {
        return type === "boolean" ? { kind: "toggle" } : { kind: "text" };
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
    if (!CONTROL_KINDS.includes(kind)) {
        invalid("unsupported string setting control", `${path}.kind`);
    }
    if (kind === "text") {
        keys(source, ["kind", "placeholder"], path);
        return { kind, ...optionalText(source.placeholder, `${path}.placeholder`) };
    }
    if (kind === "textarea") {
        keys(source, ["kind", "placeholder", "rows"], path);
        return {
            kind,
            ...optionalText(source.placeholder, `${path}.placeholder`),
            ...(source.rows === undefined ? {} : { rows: integer(source.rows, 1, 40, `${path}.rows`) }),
        };
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
    keys(source, ["kind", "methods"], path);
    return {
        kind: "endpoint-picker",
        ...(source.methods === undefined
            ? {}
            : { methods: finiteList(source.methods, ENDPOINT_METHODS, `${path}.methods`) }),
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
