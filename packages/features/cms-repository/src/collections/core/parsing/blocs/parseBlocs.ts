import type { CollectionBloc } from "cms-repository/collections/interfaces/CollectionBloc";
import { invalid } from "../../errors";
import type { CollectionLimits } from "../../limits";
import { array, identifier, integer, keys, ordinal, record, string, unique } from "../../values";
import { parseRequirements } from "../requirements";
import { parseComponentSettings } from "./settings";
import { blocReferences, parseSlots } from "./slots";
import { parseCollectionBlocTag, parseCollectionNamespace } from "../../namespace";
import { parseManagedNativeElement } from "./managedNativeElement";
import { compileBlocStyle } from "../../validation/blocStyleCompilation";

const common = [
    "kind",
    "id",
    "generation",
    "label",
    "description",
    "category",
    "order",
    "internal",
    "thumbnail",
    "uses",
    "requires",
    "slots",
    "root",
    "defaultContent",
];

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
        [
            ...common,
            ...(source.kind === "component" ? ["content", "template", "style", "settings", "runtime"] : ["lightdom"]),
        ],
        path,
    );
    const id = parseCollectionBlocTag(source.id, collectionId, `${path}.id`);
    if (source.internal !== undefined && typeof source.internal !== "boolean") {
        invalid("must be a boolean", `${path}.internal`);
    }
    const base = {
        id,
        generation:
            source.generation === undefined
                ? 1
                : integer(source.generation, 1, Number.MAX_SAFE_INTEGER, `${path}.generation`),
        label: string(source.label, 120, `${path}.label`),
        ...(source.description === undefined
            ? {}
            : { description: string(source.description, 4096, `${path}.description`) }),
        ...(source.category === undefined ? {} : { category: string(source.category, 120, `${path}.category`) }),
        ...(source.order === undefined
            ? {}
            : { order: integer(source.order, 0, Number.MAX_SAFE_INTEGER, `${path}.order`) }),
        ...(source.internal === undefined ? {} : { internal: source.internal as boolean }),
        ...(source.thumbnail === undefined ? {} : { thumbnail: identifier(source.thumbnail, `${path}.thumbnail`) }),
        uses: blocReferences(source.uses === undefined ? [] : source.uses, `${path}.uses`, limits),
        requires: parseRequirements(source.requires === undefined ? [] : source.requires, `${path}.requires`, limits),
        slots: parseSlots(source.slots === undefined ? {} : source.slots, `${path}.slots`, limits),
        root: parseManagedNativeElement(source.root, `${path}.root`),
        ...(source.kind !== "component" || source.content === undefined
            ? {}
            : { content: parseManagedNativeElement(source.content, `${path}.content`) }),
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
        source.settings === undefined ? undefined : parseComponentSettings(source.settings, `${path}.settings`, limits);
    const style =
        source.style === undefined ? undefined : optionalText(source.style, limits.maxMarkupLength, `${path}.style`);
    let styleCSS: string | undefined;
    if (style) {
        try {
            styleCSS = compileBlocStyle(id, style);
        } catch (error) {
            invalid(error instanceof Error ? error.message : "invalid Bloc CSS", `${path}.style`);
        }
    }
    const runtime = source.runtime === undefined ? undefined : record(source.runtime, `${path}.runtime`);
    if (runtime) {
        keys(runtime, ["styleCSS", "viewJS"], `${path}.runtime`);
    }
    const providedStyleCSS =
        runtime?.styleCSS === undefined
            ? undefined
            : string(runtime.styleCSS, limits.maxDocumentBytes, `${path}.runtime.styleCSS`);
    if (providedStyleCSS !== undefined && providedStyleCSS !== styleCSS) {
        invalid("must be the canonical compilation of the Bloc style", `${path}.runtime.styleCSS`);
    }
    const viewJS =
        runtime?.viewJS === undefined
            ? undefined
            : string(runtime.viewJS, limits.maxDocumentBytes, `${path}.runtime.viewJS`);
    return {
        ...base,
        kind: "component",
        template: string(source.template, limits.maxMarkupLength, `${path}.template`),
        ...(style === undefined ? {} : { style }),
        ...(settings === undefined ? {} : { settings }),
        ...(styleCSS === undefined && viewJS === undefined
            ? {}
            : {
                  runtime: {
                      ...(styleCSS === undefined ? {} : { styleCSS }),
                      ...(viewJS === undefined ? {} : { viewJS }),
                  },
              }),
    };
}

export function parseBlocs(
    value: unknown,
    collectionId: string,
    limits: Readonly<CollectionLimits>,
): readonly CollectionBloc[] {
    parseCollectionNamespace(collectionId, "$.collectionId");
    const result = array(value, limits.maxBlocs, "$.blocs").map((item, index) =>
        parseBloc(item, collectionId, `$.blocs[${index}]`, limits),
    );
    unique(
        result.map((bloc) => bloc.id),
        "$.blocs",
    );
    return result.sort((left, right) => ordinal(left.id, right.id));
}
