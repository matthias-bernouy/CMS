import type { CollectionBloc } from "cms-repository/collections/interfaces/CollectionBloc";
import { invalid } from "../../errors";
import { replaceCollectionAssetExpressions, replaceCollectionTextExpressions } from "../../texts/expressions";
import { elements, isElement, type MarkupTree, nodes, significantRoots } from "./tree";

function binding(value: string): boolean {
    return value.includes("{{") || value.includes("#{");
}

const SHADOW_LAYOUT_TAGS = new Set([
    "article",
    "aside",
    "div",
    "figure",
    "footer",
    "header",
    "main",
    "nav",
    "section",
    "slot",
    "span",
]);
const SHADOW_CONTENT_ATTRIBUTES = new Set([
    "alt",
    "aria-description",
    "aria-label",
    "formaction",
    "href",
    "poster",
    "src",
    "srcset",
    "title",
]);

/** Explicit V1 authoring exclusions; this is not an HTML sanitizer. */
export function validateDeclarative(tree: MarkupTree, path: string, shadow = false): void {
    for (const node of elements(tree)) {
        if (node.name === "script") {
            invalid("script elements are outside the V1 declarative markup profile", path);
        }
        if (Object.keys(node.attribs).some((name) => name.startsWith("on"))) {
            invalid("event-handler attributes are outside the V1 declarative markup profile", path);
        }
        if (Object.hasOwn(node.attribs, "style")) {
            invalid("inline style attributes are forbidden", path);
        }
        if (!shadow && Object.hasOwn(node.attribs, "class")) {
            invalid("class attributes belong only in shadowdom", path);
        }
    }
}

export function validateNoBindings(tree: MarkupTree, path: string): void {
    for (const node of nodes(tree)) {
        if (node.type === "text") {
            validateInitialValue(node.data, path);
        }
        if (isElement(node)) {
            for (const value of Object.values(node.attribs)) {
                validateInitialValue(value, path);
            }
        }
    }
}

function validateInitialValue(value: string, path: string): void {
    let withoutServerExpressions: string;
    try {
        const withoutTexts = replaceCollectionTextExpressions(value, () => "");
        withoutServerExpressions = replaceCollectionAssetExpressions(withoutTexts, () => "");
    } catch (error) {
        invalid(error instanceof Error ? error.message : "invalid server collection expression", path);
    }
    if (binding(withoutServerExpressions)) {
        invalid("dynamic bindings belong only in lightdom", path);
    }
}

export function validateShadow(tree: MarkupTree, path: string): void {
    for (const node of nodes(tree)) {
        if (node.type === "text") {
            if (binding(node.data)) {
                invalid("shadow shells are static and cannot contain bindings", path);
            }
            if (node.data.trim()) {
                invalid("shadow shells cannot contain text; put content in lightdom", path);
            }
        }
        if (!isElement(node)) {
            continue;
        }
        if (node.name.startsWith("cms-") || Object.keys(node.attribs).some((name) => name.startsWith("cms-"))) {
            invalid("shadow shells cannot contain cms-* directives", path);
        }
        if (Object.values(node.attribs).some(binding)) {
            invalid("shadow shells are static and cannot contain bindings", path);
        }
        if (!SHADOW_LAYOUT_TAGS.has(node.name)) {
            invalid("shadow shells contain layout and slots only; put semantic content in lightdom", path);
        }
        if (Object.keys(node.attribs).some((name) => SHADOW_CONTENT_ATTRIBUTES.has(name))) {
            invalid("shadow shells cannot carry text or URL attributes", path);
        }
    }
}

export function validateHost(tree: MarkupTree, bloc: CollectionBloc, path: string): void {
    const hosts = elements(tree).filter((node) => node.name === "cms-host");
    if (hosts.length === 0) {
        return;
    }
    if (bloc.kind !== "component") {
        invalid("cms-host requires a component shadow shell", path);
    }
    const roots = significantRoots(tree);
    if (hosts.length !== 1 || roots.length !== 1 || roots[0] !== hosts[0]) {
        invalid("cms-host must be the single root of lightdom", path);
    }
}
