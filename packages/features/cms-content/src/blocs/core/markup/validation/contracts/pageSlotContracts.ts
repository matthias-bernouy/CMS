import { isValidCustomElementTag } from "cms-content/application/core/validation/predicates";
import type { TBloc } from "cms-content/blocs/interfaces/blocs";
import type { PageSlot, PageSlotAccept } from "cms-content/pages/interfaces/document";

type ContractElement = Element & { readonly children: HTMLCollectionOf<ContractElement> };
type ContractBloc = Pick<TBloc, "id" | "nativeElement" | "slots" | "compositionHTML">;

const INLINE_ROOTS = new Set([
    "a",
    "abbr",
    "b",
    "br",
    "cite",
    "code",
    "em",
    "figcaption",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "label",
    "p",
    "small",
    "span",
    "strong",
]);
const INLINE_DESCENDANTS = new Set(["a", "abbr", "b", "br", "cite", "code", "em", "small", "span", "strong"]);
const PROSE_ROOTS = new Set([...INLINE_ROOTS, "blockquote", "div", "ol", "p", "pre", "ul"]);
const PROSE_DESCENDANTS = new Set([...PROSE_ROOTS, "li"]);
export function blocHostContractIssue(
    host: ContractElement,
    bloc: ContractBloc,
    registered: ReadonlyMap<string, ContractBloc>,
): string | null {
    if (bloc.nativeElement) {
        return validateNestedCustomElements(host, registered);
    }
    const slots = bloc.slots ?? {};
    const counts = new Map<string, number>();
    for (const node of Array.from(host.childNodes)) {
        if (node.nodeType === 3 && node.textContent?.trim()) {
            return `<${bloc.id}> contains text outside a declared Bloc slot`;
        }
        if (node.nodeType !== 1) {
            continue;
        }
        const child = node as ContractElement;
        const slotName = child.getAttribute("slot") ?? "";
        const slot = slots[slotName];
        if (!slot) {
            return `<${bloc.id}> does not declare slot ${JSON.stringify(slotName || "(default)")}`;
        }
        const issue = slotChildIssue(child, slot, registered);
        if (issue) {
            return `<${bloc.id}> slot ${JSON.stringify(slotName)} ${issue}`;
        }
        counts.set(slotName, (counts.get(slotName) ?? 0) + 1);
    }
    for (const [name, slot] of Object.entries(slots)) {
        const count = counts.get(name) ?? 0;
        if (slot.min !== undefined && count < slot.min) {
            return `<${bloc.id}> slot ${JSON.stringify(name)} requires at least ${slot.min} item(s)`;
        }
        if (slot.max !== undefined && count > slot.max) {
            return `<${bloc.id}> slot ${JSON.stringify(name)} accepts at most ${slot.max} item(s)`;
        }
    }
    return null;
}

function slotChildIssue(
    child: ContractElement,
    slot: PageSlot,
    registered: ReadonlyMap<string, ContractBloc>,
): string | null {
    const tag = child.localName.toLowerCase();
    const accepts = slot.accepts ?? [];
    if (isValidCustomElementTag(tag)) {
        const nested = registered.get(tag);
        if (!nested) {
            return `references unavailable Bloc <${tag}>`;
        }
        if (!accepts.some((accept) => acceptsCustomBloc(accept, nested))) {
            return `does not accept Bloc <${tag}>`;
        }
        return blocHostContractIssue(child, nested, registered);
    }
    if (!accepts.some((accept) => acceptsNativeElement(accept, child))) {
        return `does not accept native <${tag}>`;
    }
    return null;
}

function acceptsCustomBloc(accept: PageSlotAccept, bloc: ContractBloc): boolean {
    if (accept.kind === "any-component") {
        return bloc.compositionHTML === undefined;
    }
    if (accept.kind === "component") {
        return accept.tag === bloc.id && bloc.compositionHTML === undefined;
    }
    return false;
}

function acceptsNativeElement(accept: PageSlotAccept, element: ContractElement): boolean {
    const tag = element.localName.toLowerCase();
    if (accept.kind === "plain-text") {
        return tag === "span" && element.children.length === 0;
    }
    if (accept.kind !== "rich-text") {
        return false;
    }
    const roots = accept.profile === "inline" ? INLINE_ROOTS : PROSE_ROOTS;
    const descendants = accept.profile === "inline" ? INLINE_DESCENDANTS : PROSE_DESCENDANTS;
    return roots.has(tag) && nativeSubtreeMatches(element, descendants);
}

function nativeSubtreeMatches(element: ContractElement, allowed: ReadonlySet<string>): boolean {
    for (const child of Array.from(element.children)) {
        if (
            child.hasAttribute("slot") ||
            !allowed.has(child.localName.toLowerCase()) ||
            !nativeSubtreeMatches(child, allowed)
        ) {
            return false;
        }
    }
    return true;
}

function validateNestedCustomElements(
    root: ContractElement,
    registered: ReadonlyMap<string, ContractBloc>,
): string | null {
    for (const child of Array.from(root.children)) {
        if (!isValidCustomElementTag(child.localName)) {
            continue;
        }
        const nested = registered.get(child.localName);
        if (!nested) {
            return `<${root.localName}> references unavailable Bloc <${child.localName}>`;
        }
        const issue = blocHostContractIssue(child, nested, registered);
        if (issue) {
            return issue;
        }
    }
    return null;
}
