import type { CollectionBloc, CollectionComponent } from "../../../interfaces/CollectionBloc";
import { invalid } from "../../errors";
import type { BlocMarkup } from "./slots";
import { elements, isElement, type MarkupTree, significantRoots } from "./tree";
import { managedNativeAttributesIssue } from "../../parsing/blocs/managedNativeElement";

export function validateManagedNativeDefinition(bloc: CollectionBloc, markup: BlocMarkup, path: string): void {
    if (bloc.kind !== "component" || !bloc.nativeElement) {
        return;
    }
    const slots = markup.shadow ? elements(markup.shadow).filter((node) => node.name === "slot") : [];
    if (slots.length !== 1 || slots[0]!.attribs.name !== undefined) {
        invalid("managed native components require exactly one default shadow slot", `${path}.shadowdom`);
    }
    if (Object.keys(bloc.slots).length > 0) {
        invalid("managed native components cannot declare page slots", `${path}.slots`);
    }
    if (!markup.initial) {
        invalid("managed native components require defaultContent", `${path}.defaultContent`);
    }
    const roots = significantRoots(markup.initial);
    const accepted = new Set(bloc.nativeElement.accepts);
    if (
        roots.length !== 1 ||
        !isElement(roots[0]!) ||
        !accepted.has(roots[0]!.name as (typeof bloc.nativeElement.accepts)[number]) ||
        roots[0]!.attribs.slot !== undefined
    ) {
        invalid(
            `defaultContent must contain exactly one un-slotted accepted native root (${formatAccepted(bloc)})`,
            `${path}.defaultContent`,
        );
    }
    const attributeIssue = isElement(roots[0]!)
        ? managedNativeAttributesIssue(bloc.nativeElement, roots[0]!.attribs, roots[0]!.name)
        : null;
    if (attributeIssue) {
        invalid(`defaultContent ${attributeIssue}`, `${path}.defaultContent`);
    }
    if (isElement(roots[0]!)) {
        const semanticIssue = managedNativeSemanticIssue(roots[0]!);
        if (semanticIssue) {
            invalid(`defaultContent ${semanticIssue}`, `${path}.defaultContent`);
        }
    }
}

export function validateManagedNativeHosts(
    tree: MarkupTree,
    blocs: ReadonlyMap<string, CollectionBloc>,
    path: string,
    options: { strictAttributes?: boolean } = {},
): void {
    for (const host of elements(tree)) {
        const target = blocs.get(host.name);
        if (target?.kind !== "component" || !target.nativeElement) {
            continue;
        }
        if (!hasOnlyManagedChild(host, target, options.strictAttributes !== false)) {
            invalid(
                `bloc ${target.id} requires exactly one direct, un-slotted accepted native child (${formatAccepted(target)})`,
                path,
            );
        }
    }
}

function hasOnlyManagedChild(
    host: ReturnType<typeof elements>[number],
    bloc: CollectionComponent,
    strictAttributes: boolean,
): boolean {
    const children = host.children.filter(isElement);
    const siblingText = host.children.some((node) => node.type === "text" && node.data.trim().length > 0);
    return (
        children.length === 1 &&
        bloc.nativeElement?.accepts.includes(children[0]!.name as (typeof bloc.nativeElement.accepts)[number]) ===
            true &&
        children[0]!.attribs.slot === undefined &&
        !siblingText &&
        managedNativeAttributesIssue(bloc.nativeElement!, children[0]!.attribs, children[0]!.name, {
            allowUnknown: !strictAttributes,
        }) === null &&
        managedNativeSemanticIssue(children[0]!) === null
    );
}

function managedNativeSemanticIssue(element: ReturnType<typeof elements>[number]): string | null {
    const label = element.attribs["aria-label"];
    if (label !== undefined && !label.trim()) {
        return "native aria-label must not be empty";
    }
    const current = element.attribs["aria-current"];
    if (current !== undefined && !["page", "step", "location", "date", "time", "true", "false"].includes(current)) {
        return "native aria-current value is not controlled";
    }
    const live = element.attribs["aria-live"];
    if (live !== undefined && !["off", "polite", "assertive"].includes(live)) {
        return "native aria-live value is not controlled";
    }
    const role = element.attribs.role;
    if (element.name === "input" && role !== undefined && role !== "switch") {
        return 'native input role must be "switch" or omitted';
    }
    if (element.name === "input" && role === "switch" && element.attribs.type !== "checkbox") {
        return 'native role="switch" requires input type="checkbox"';
    }
    if (
        (element.name === "a" || element.name === "button") &&
        !element.attribs["aria-label"]?.trim() &&
        !hasAuthoredText(element)
    ) {
        return `native <${element.name}> requires text content or a non-empty aria-label`;
    }
    return null;
}

function hasAuthoredText(element: ReturnType<typeof elements>[number]): boolean {
    return element.children.some(
        (child) =>
            (child.type === "text" && child.data.trim().length > 0) || (isElement(child) && hasAuthoredText(child)),
    );
}

function formatAccepted(bloc: CollectionComponent): string {
    const elements = bloc.nativeElement!.accepts.map((tag) => `<${tag}>`).join(", ");
    const attributes = Object.entries(bloc.nativeElement!.attributes ?? {})
        .map(([name, constraint]) =>
            constraint.values ? `${name}=${constraint.values.map((value) => JSON.stringify(value)).join("|")}` : name,
        )
        .join(", ");
    return attributes ? `${elements}; ${attributes}` : elements;
}
