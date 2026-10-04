import type { CollectionComponentSettings, CollectionSettingItem } from "../../../interfaces/CollectionBloc";
import { invalid } from "../../errors";
import type { CollectionLimits } from "../../limits";
import { array, keys, record, string, unique } from "../../values";
import { parseConfiguration } from "../configuration";
import { parseSettingControl, settingControlValues } from "./settingControls";
import { assertVisibilityAcyclic, parseSettingVisibility } from "./visibility";

const DEFAULT_MAX_LENGTH = 256;

/** One item owns its value constraints, insertion default and editor metadata. */
export function parseComponentSettings(
    value: unknown,
    path: string,
    limits: Readonly<CollectionLimits>,
): CollectionComponentSettings {
    const inputs = array(value, limits.maxSettingsPerBloc, path);
    if (inputs.length === 0) {
        invalid("must contain at least one setting", path);
    }
    const entries = inputs.map((value, index) => {
        const itemPath = `${path}[${index}]`;
        const source = record(value, itemPath);
        keys(
            source,
            [
                "id",
                "label",
                "group",
                "help",
                "type",
                "default",
                "control",
                "minLength",
                "maxLength",
                "minimum",
                "maximum",
                "visibleWhen",
            ],
            itemPath,
        );
        const id = string(source.id, 96, `${itemPath}.id`);
        if (
            !/^[a-z][a-z0-9-]*$/.test(id) ||
            id.startsWith("on") ||
            id.startsWith("cms-") ||
            id.startsWith("data-cms-") ||
            ["class", "style", "slot", "id"].includes(id)
        ) {
            invalid("setting IDs must be safe, lowercase HTML attributes", `${itemPath}.id`);
        }
        if (!["string", "boolean", "number", "integer"].includes(source.type as string)) {
            invalid("settings support string, boolean, number and integer attributes", `${itemPath}.type`);
        }
        if (!Object.hasOwn(source, "default")) {
            invalid("must declare a default value", `${itemPath}.default`);
        }
        const label = nonblank(source.label, `${itemPath}.label`);
        const group = source.group === undefined ? undefined : nonblank(source.group, `${itemPath}.group`);
        const help = source.help === undefined ? undefined : nonblank(source.help, `${itemPath}.help`);
        const type = source.type as CollectionSettingItem["type"];
        const control = parseSettingControl(source.control, type, `${itemPath}.control`, limits);
        if (control.kind === "range" && (source.minimum === undefined || source.maximum === undefined)) {
            invalid("range controls require minimum and maximum constraints", `${itemPath}.control`);
        }
        if (type !== "string" && ["minLength", "maxLength"].some((key) => key in source)) {
            invalid(`${type} settings cannot declare string constraints`, itemPath);
        }
        if ((type === "string" || type === "boolean") && ["minimum", "maximum"].some((key) => key in source)) {
            invalid(`${type} settings cannot declare numeric constraints`, itemPath);
        }
        const values = settingControlValues(control);
        const inferredMaxLength = values?.reduce((maximum, value) => Math.max(maximum, value.length), 0);
        const schema =
            type === "boolean"
                ? { type: "boolean" }
                : type === "string"
                  ? {
                        type: "string",
                        maxLength: source.maxLength ?? inferredMaxLength ?? DEFAULT_MAX_LENGTH,
                        ...(source.minLength === undefined ? {} : { minLength: source.minLength }),
                        ...(values === undefined ? {} : { enum: values }),
                    }
                  : {
                        type,
                        ...(source.minimum === undefined ? {} : { minimum: source.minimum }),
                        ...(source.maximum === undefined ? {} : { maximum: source.maximum }),
                    };
        return {
            id,
            label,
            ...(group === undefined ? {} : { group }),
            ...(help === undefined ? {} : { help }),
            control,
            default: source.default,
            schema,
        };
    });
    unique(
        entries.map((entry) => entry.id),
        path,
    );
    // Setting IDs are HTML attribute names and may contain hyphens. Contract
    // schema property names are intentionally narrower, so validate the same
    // values through stable internal keys instead of leaking that restriction.
    const configurationKeys = entries.map((_, index) => `setting${index}`);
    const parsed = parseConfiguration(
        {
            schema: {
                type: "object",
                properties: Object.fromEntries(entries.map((entry, index) => [configurationKeys[index], entry.schema])),
                required: configurationKeys,
            },
            defaults: Object.fromEntries(entries.map((entry, index) => [configurationKeys[index], entry.default])),
        },
        path,
        limits,
    );
    const baseSettings: CollectionComponentSettings = entries.map(({ id, label, group, help, control }, index) => {
        const configurationKey = configurationKeys[index]!;
        const schema = parsed.schema.properties[configurationKey]!;
        const defaultValue = parsed.defaults[configurationKey];
        if (schema.type === "boolean") {
            return {
                id,
                label,
                ...(group ? { group } : {}),
                ...(help ? { help } : {}),
                type: "boolean",
                default: defaultValue as boolean,
                control: control as Extract<CollectionSettingItem["control"], { kind: "toggle" }>,
            };
        }
        if (schema.type === "number" || schema.type === "integer") {
            return {
                id,
                label,
                ...(group ? { group } : {}),
                ...(help ? { help } : {}),
                type: schema.type,
                default: defaultValue as number,
                ...(schema.minimum === undefined ? {} : { minimum: schema.minimum }),
                ...(schema.maximum === undefined ? {} : { maximum: schema.maximum }),
                control: control as Extract<CollectionSettingItem["control"], { kind: "number" | "range" }>,
            } satisfies CollectionSettingItem;
        }
        if (schema.type === "string") {
            return {
                id,
                label,
                ...(group ? { group } : {}),
                ...(help ? { help } : {}),
                type: "string",
                default: defaultValue as string,
                maxLength: schema.maxLength,
                ...(schema.minLength === undefined ? {} : { minLength: schema.minLength }),
                control: control as Extract<CollectionSettingItem, { type: "string" }>["control"],
            } satisfies CollectionSettingItem;
        }
        return invalid("unsupported setting schema", `${path}.${id}`);
    });
    const settings: CollectionComponentSettings = baseSettings.map((item, index) => {
        const itemPath = `${path}[${index}]`;
        const visibility = parseSettingVisibility(
            record(inputs[index], itemPath).visibleWhen,
            `${itemPath}.visibleWhen`,
            item.id,
            baseSettings,
        );
        return visibility ? { ...item, visibleWhen: visibility } : item;
    });
    assertVisibilityAcyclic(settings, path);
    return settings;
}

function nonblank(value: unknown, path: string): string {
    const parsed = string(value, 120, path);
    if (!parsed.trim()) {
        invalid("must not be blank", path);
    }
    return parsed;
}
