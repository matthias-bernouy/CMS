import type { CollectionBloc } from "cms-repository/collections/interfaces/CollectionBloc";
import { invalid } from "../../errors";
import type { CollectionLimits } from "../../limits";
import { array, identifier, keys, ordinal, record, string, unique } from "../../values";
import { parseConfiguration } from "../configuration";
import { parseRequirements } from "../requirements";
import { blocReferences, parseSlots } from "./slots";

const common = ["kind", "id", "description", "internal", "thumbnail", "uses", "requires", "slots", "defaultContent"];

function optionalText(value: unknown, maximum: number, path: string): string {
    if (typeof value !== "string" || value.length > maximum) {
        invalid(`must be a string of at most ${maximum} characters`, path);
    }
    return value;
}

function parseBloc(
    value: unknown,
    collectionId: string,
    path: string,
    limits: Readonly<CollectionLimits>,
): CollectionBloc {
    const source = record(value, path);
    if (source.kind !== "component" && source.kind !== "composition") {
        invalid("kind must be component or composition", `${path}.kind`);
    }
    keys(
        source,
        [...common, ...(source.kind === "component" ? ["shadowdom", "lightdom", "style", "settings"] : ["lightdom"])],
        path,
    );
    const id = identifier(source.id, `${path}.id`);
    if (!id.startsWith(`${collectionId}-`) || id.length === collectionId.length + 1) {
        invalid(`must be a custom-element tag prefixed by ${collectionId}-`, `${path}.id`);
    }
    if (source.internal !== undefined && typeof source.internal !== "boolean") {
        invalid("must be a boolean", `${path}.internal`);
    }
    const base = {
        id,
        ...(source.description === undefined
            ? {}
            : { description: string(source.description, 4096, `${path}.description`) }),
        ...(source.internal === undefined ? {} : { internal: source.internal as boolean }),
        ...(source.thumbnail === undefined ? {} : { thumbnail: identifier(source.thumbnail, `${path}.thumbnail`) }),
        uses: blocReferences(source.uses === undefined ? [] : source.uses, `${path}.uses`, limits),
        requires: parseRequirements(source.requires === undefined ? [] : source.requires, `${path}.requires`, limits),
        slots: parseSlots(source.slots === undefined ? {} : source.slots, `${path}.slots`, limits),
        ...(source.defaultContent === undefined
            ? {}
            : {
                  defaultContent: optionalText(source.defaultContent, limits.maxMarkupLength, `${path}.defaultContent`),
              }),
    };
    if (source.kind === "composition") {
        return {
            ...base,
            kind: "composition",
            lightdom: string(source.lightdom, limits.maxMarkupLength, `${path}.lightdom`),
        };
    }
    const settings =
        source.settings === undefined ? undefined : parseConfiguration(source.settings, `${path}.settings`, limits);
    if (settings) {
        const names = Object.keys(settings.schema.properties).map((name) => name.toLowerCase());
        if (new Set(names).size !== names.length) {
            invalid(
                "setting names must not differ only by case because HTML attributes ignore case",
                `${path}.settings.schema.properties`,
            );
        }
    }
    return {
        ...base,
        kind: "component",
        shadowdom: string(source.shadowdom, limits.maxMarkupLength, `${path}.shadowdom`),
        ...(source.lightdom === undefined
            ? {}
            : { lightdom: string(source.lightdom, limits.maxMarkupLength, `${path}.lightdom`) }),
        ...(source.style === undefined
            ? {}
            : { style: optionalText(source.style, limits.maxMarkupLength, `${path}.style`) }),
        ...(settings === undefined ? {} : { settings }),
    };
}

export function parseBlocs(
    value: unknown,
    collectionId: string,
    limits: Readonly<CollectionLimits>,
): readonly CollectionBloc[] {
    const result = array(value, limits.maxBlocs, "$.blocs").map((item, index) =>
        parseBloc(item, collectionId, `$.blocs[${index}]`, limits),
    );
    unique(
        result.map((bloc) => bloc.id),
        "$.blocs",
    );
    return result.sort((left, right) => ordinal(left.id, right.id));
}
