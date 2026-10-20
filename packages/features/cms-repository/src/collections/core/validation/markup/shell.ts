import { invalid } from "../../errors";
import { replaceCollectionAssetExpressions, replaceCollectionTextExpressions } from "../../texts/expressions";
import { elements, isElement, type MarkupTree, nodes } from "./tree";

function binding(value: string): boolean {
    return value.includes("{{") || value.includes("#{");
}

/** Explicit V1 authoring exclusions; this is not an HTML sanitizer. */
export function validateDeclarative(tree: MarkupTree, path: string, allowClasses = false): void {
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
        if (!allowClasses && Object.hasOwn(node.attribs, "class")) {
            invalid("class attributes belong only in component markup", path);
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
        invalid("dynamic bindings belong only in Bloc markup", path);
    }
}
