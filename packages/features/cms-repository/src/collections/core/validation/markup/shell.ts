import type { CollectionBloc } from "cms-repository/collections/interfaces/CollectionBloc";
import { invalid } from "../../errors";
import { elements, isElement, type MarkupTree, nodes, significantRoots } from "./tree";

function binding(value: string): boolean {
    return value.includes("{{") || value.includes("#{");
}

/** Explicit V1 authoring exclusions; this is not an HTML sanitizer. */
export function validateDeclarative(tree: MarkupTree, path: string): void {
    for (const node of elements(tree)) {
        if (node.name === "script") {
            invalid("script elements are outside the V1 declarative markup profile", path);
        }
        if (Object.keys(node.attribs).some((name) => name.startsWith("on"))) {
            invalid("event-handler attributes are outside the V1 declarative markup profile", path);
        }
    }
}

export function validateShadow(tree: MarkupTree, path: string): void {
    for (const node of nodes(tree)) {
        if (node.type === "text" && binding(node.data)) {
            invalid("shadow shells are static and cannot contain bindings", path);
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
