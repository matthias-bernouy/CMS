import type { PageBlocContract, PageSlot, PageSlotAccept } from "cms-content/pages/interfaces/document";

type ContractElement = Element & { readonly children: HTMLCollectionOf<ContractElement> };
type ContractBloc = PageBlocContract;

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
    unresolved: ReadonlySet<string> = new Set(),
    allowTemplateSlots = false,
    allowOwnedNative = false,
): string | null {
    if (bloc.content) {
        const authored = Array.from(host.childNodes).filter(
            (node) => node.nodeType === 1 || (node.nodeType === 3 && Boolean(node.textContent?.trim())),
        );
        if (authored.length !== 1 || authored[0]?.nodeType !== 1) {
            return `<${bloc.id}> requires exactly one Page-owned native child`;
        }
        if ((authored[0] as Element).hasAttribute("cms-bloc")) {
            return `<${bloc.id}> managed native content cannot be another Bloc`;
        }
        return null;
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
            return `<${bloc.id}> direct parent does not declare slot target ${JSON.stringify(slotName || "(default)")}`;
        }
        const issue =
            allowTemplateSlots && child.localName === "slot"
                ? null
                : slotChildIssue(child, slot, registered, unresolved, allowTemplateSlots, allowOwnedNative);
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
    unresolved: ReadonlySet<string>,
    allowTemplateSlots: boolean,
    allowOwnedNative: boolean,
): string | null {
    const tag = child.getAttribute("cms-bloc")?.toLowerCase();
    const accepts = slot.accepts ?? [];
    if (tag) {
        const nested = registered.get(tag);
        if (!nested && !unresolved.has(tag)) {
            return `references unavailable Bloc <${tag}>`;
        }
        if (!accepts.some((accept) => acceptsCustomBloc(accept, tag, nested))) {
            return `does not accept Bloc ${tag}`;
        }
        return nested
            ? blocHostContractIssue(child, nested, registered, unresolved, allowTemplateSlots, allowOwnedNative)
            : null;
    }
    if (allowOwnedNative) {
        return null;
    }
    if (!accepts.some((accept) => acceptsNativeElement(accept, child))) {
        return `does not accept native <${tag}>`;
    }
    return null;
}

function acceptsCustomBloc(accept: PageSlotAccept, tag: string, bloc: ContractBloc | undefined): boolean {
    if (accept.kind === "any-component") {
        return bloc?.kind !== "composition";
    }
    if (accept.kind === "component") {
        return accept.tag === tag && bloc?.kind !== "composition";
    }
    return false;
}

function acceptsNativeElement(accept: PageSlotAccept, element: ContractElement): boolean {
    const tag = element.localName.toLowerCase();
    if (accept.kind === "plain-text") {
        return tag === "span" && element.children.length === 0;
    }
    if (accept.kind !== "native-content") {
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
