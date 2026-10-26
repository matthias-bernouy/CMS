import { resourceMetadata } from "../../validation/lifecycle/metadata";
import { parseBlocExampleMetadata } from "../../validation/examples/catalogue";
import type { CollectionBloc } from "cms-repository/collections/interfaces/CollectionBloc";
import { invalid } from "../../errors";
import type { CollectionLimits } from "../../limits";
import { array, integer, keys, ordinal, record, string, unique } from "../../values";
import { parseRequirements } from "../requirements";
import { parseComponentSettings } from "./settings";
import { blocReferences, parseSlots } from "./slots";
import { parseCollectionBlocTag, parseCollectionNamespace } from "../../namespace";
import { parseManagedNativeElement } from "./managedNativeElement";
import { compileBlocStyle } from "../../validation/blocStyleCompilation";
import { validateCompiledBlocBehavior } from "../../validation/blocBehaviorPolicy";
import { CMS_BROWSER_RUNTIME_ABI } from "@bernouy/cms-content/runtime-abi";
import { blocSettingAttributeNameIssue, validateBlocBrowserCapabilities } from "@bernouy/cms-content/page-document";

const common = [
    "kind",
    "id",
    "deprecation",
    "label",
    "description",
    "categories",
    "examples",
    "defaultExample",
    "order",
    "catalogue",
    "uses",
    "requires",
    "slots",
    "root",
    "markup",
    "browser",
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
    keys(source, [...common, ...(source.kind === "component" ? ["style", "settings", "runtime"] : [])], path);
    const metadata = parseBlocExampleMetadata(source, path);
    const id = parseCollectionBlocTag(source.id, collectionId, `${path}.id`);
    if (source.catalogue !== undefined && source.catalogue !== "listed" && source.catalogue !== "hidden") {
        invalid("must be listed or hidden", `${path}.catalogue`);
    }
    const markup = string(source.markup, limits.maxMarkupLength, `${path}.markup`);
    let browser;
    try {
        browser = validateBlocBrowserCapabilities(source.browser, [markup], `${path}.browser`);
    } catch (error) {
        invalid(error instanceof Error ? error.message : "invalid browser capabilities", `${path}.browser`);
    }
    const base = {
        ...metadata,
        id,
        ...resourceMetadata(source, path),
        label: string(source.label, 120, `${path}.label`),
        description: string(source.description, 4096, `${path}.description`),
        ...(source.order === undefined
            ? {}
            : { order: integer(source.order, 0, Number.MAX_SAFE_INTEGER, `${path}.order`) }),
        ...(source.catalogue === undefined ? {} : { catalogue: source.catalogue as "listed" | "hidden" }),
        uses: blocReferences(source.uses === undefined ? [] : source.uses, `${path}.uses`, limits),
        requires: parseRequirements(source.requires === undefined ? [] : source.requires, `${path}.requires`, limits),
        slots: parseSlots(source.slots === undefined ? {} : source.slots, `${path}.slots`, limits),
        root: parseManagedNativeElement(source.root, `${path}.root`),
        markup,
        ...(browser === undefined ? {} : { browser }),
    };
    if (source.kind === "composition") {
        return {
            ...base,
            kind: "composition",
        };
    }
    const settings =
        source.settings === undefined ? undefined : parseComponentSettings(source.settings, `${path}.settings`, limits);
    for (const [index, setting] of (settings ?? []).entries()) {
        const issue = blocSettingAttributeNameIssue(setting.id, base.root.accepts);
        if (issue) {
            invalid(issue, `${path}.settings[${index}].id`);
        }
    }
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
        keys(runtime, ["browserAbi", "styleCSS", "viewJS"], `${path}.runtime`);
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
    if (viewJS === undefined && runtime?.browserAbi !== undefined) {
        invalid("is only allowed with viewJS", `${path}.runtime.browserAbi`);
    }
    if (viewJS !== undefined && runtime?.browserAbi !== CMS_BROWSER_RUNTIME_ABI) {
        invalid(`must equal ${CMS_BROWSER_RUNTIME_ABI} when viewJS is present`, `${path}.runtime.browserAbi`);
    }
    if (viewJS !== undefined) {
        const behaviorErrors = validateCompiledBlocBehavior(viewJS, `${path}.runtime.viewJS`);
        if (behaviorErrors[0]) {
            invalid(behaviorErrors.join("; "), `${path}.runtime.viewJS`);
        }
    }
    return {
        ...base,
        kind: "component",
        ...(style === undefined ? {} : { style }),
        ...(settings === undefined ? {} : { settings }),
        ...(styleCSS === undefined && viewJS === undefined
            ? {}
            : {
                  runtime: {
                      ...(viewJS === undefined ? {} : { browserAbi: CMS_BROWSER_RUNTIME_ABI }),
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
