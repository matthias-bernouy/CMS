import type { UlviaObjectSchema } from "cms-repository/exports/contracts/schema";
import type { CollectionComponentSettings, CollectionSettingItem } from "../../../interfaces/CollectionBloc";
import { invalid } from "../../errors";
import type { CollectionLimits } from "../../limits";
import { array, keys, record, string, unique } from "../../values";
import { parseConfiguration } from "../configuration";
import { assertVisibilityAcyclic, parseSettingVisibility } from "./visibility";

const DEFAULT_MAX_LENGTH = 256;

/** One item owns its value constraints, insertion default and editor metadata. */
export function parseComponentSettings(
    value: unknown,
    path: string,
    limits: Readonly<CollectionLimits>,
): CollectionComponentSettings {
    const inputs = array(value, limits.schema.maxProperties, path);
    if (inputs.length === 0) {
        invalid("must contain at least one setting", path);
    }
    const entries = inputs.map((value, index) => {
        const itemPath = `${path}[${index}]`;
        const source = record(value, itemPath);
        keys(
            source,
            ["id", "label", "group", "type", "default", "enum", "minLength", "maxLength", "visibleWhen"],
            itemPath,
        );
        const id = string(source.id, 96, `${itemPath}.id`);
        if (
            !/^[a-z][a-z0-9-]*$/.test(id) ||
            id.startsWith("on") ||
            id.startsWith("cms-") ||
            id.startsWith("data-p9r-") ||
            ["class", "style", "slot", "id"].includes(id)
        ) {
            invalid("setting IDs must be safe, lowercase HTML attributes", `${itemPath}.id`);
        }
        if (source.type !== "string" && source.type !== "boolean") {
            invalid("settings currently support string and boolean attributes", `${itemPath}.type`);
        }
        if (!Object.hasOwn(source, "default")) {
            invalid("must declare a default value", `${itemPath}.default`);
        }
        const label = nonblank(source.label, `${itemPath}.label`);
        const group = source.group === undefined ? undefined : nonblank(source.group, `${itemPath}.group`);
        if (source.type === "boolean" && ["enum", "minLength", "maxLength"].some((key) => key in source)) {
            invalid("boolean settings cannot declare string constraints", itemPath);
        }
        const schema =
            source.type === "boolean"
                ? { type: "boolean" }
                : {
                      type: "string",
                      maxLength: source.maxLength === undefined ? DEFAULT_MAX_LENGTH : source.maxLength,
                      ...(source.minLength === undefined ? {} : { minLength: source.minLength }),
                      ...(source.enum === undefined ? {} : { enum: source.enum }),
                  };
        return { id, label, ...(group === undefined ? {} : { group }), default: source.default, schema };
    });
    unique(
        entries.map((entry) => entry.id),
        path,
    );
    const parsed = parseConfiguration(
        {
            schema: {
                type: "object",
                properties: Object.fromEntries(entries.map((entry) => [entry.id, entry.schema])),
                required: entries.map((entry) => entry.id),
            },
            defaults: Object.fromEntries(entries.map((entry) => [entry.id, entry.default])),
        },
        path,
        limits,
    );
    const baseSettings: CollectionComponentSettings = entries.map(({ id, label, group }) => {
        const schema = parsed.schema.properties[id]!;
        const defaultValue = parsed.defaults[id];
        if (schema.type === "boolean") {
            return { id, label, ...(group ? { group } : {}), type: "boolean", default: defaultValue as boolean };
        }
        if (schema.type === "string") {
            return {
                id,
                label,
                ...(group ? { group } : {}),
                type: "string",
                default: defaultValue as string,
                maxLength: schema.maxLength,
                ...(schema.minLength === undefined ? {} : { minLength: schema.minLength }),
                ...(schema.enum === undefined ? {} : { enum: schema.enum }),
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

export function collectionSettingsSchema(settings: CollectionComponentSettings): UlviaObjectSchema {
    return {
        type: "object",
        properties: Object.fromEntries(
            settings.map((item) => [
                item.id,
                item.type === "boolean"
                    ? { type: "boolean" as const }
                    : {
                          type: "string" as const,
                          maxLength: item.maxLength,
                          ...(item.minLength === undefined ? {} : { minLength: item.minLength }),
                          ...(item.enum === undefined ? {} : { enum: item.enum }),
                      },
            ]),
        ),
        required: settings.map((item) => item.id),
    };
}

function nonblank(value: unknown, path: string): string {
    const parsed = string(value, 120, path);
    if (!parsed.trim()) {
        invalid("must not be blank", path);
    }
    return parsed;
}
