import { invalid } from "../../errors";
import { elements, type MarkupTree } from "./tree";

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
