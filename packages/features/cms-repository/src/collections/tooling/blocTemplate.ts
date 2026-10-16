import { parseHTML } from "linkedom";

/** Merge fixed Light DOM into a component shell while retaining Page slot placeholders. */
export function compileBlocTemplate(shell: string, fixed?: string): string {
    if (!fixed?.trim()) {
        return shell.trim();
    }
    const { document } = parseHTML("<!doctype html><html><body></body></html>");
    const shellTemplate = document.createElement("template");
    shellTemplate.innerHTML = shell;
    const fixedTemplate = document.createElement("template");
    fixedTemplate.innerHTML = fixed;
    const marker = fixedTemplate.content.querySelector("template[cms-root]") as HTMLTemplateElement | null;
    const authored = marker ? Array.from(marker.content.childNodes) : Array.from(fixedTemplate.content.childNodes);
    projectSlots(shellTemplate.content, authored);
    if (marker) {
        const rootMarker = document.createElement("template");
        rootMarker.setAttribute("cms-root", "");
        for (const attribute of Array.from(marker.attributes)) {
            if (attribute.name !== "cms-root") {
                rootMarker.setAttribute(attribute.name, attribute.value);
            }
        }
        shellTemplate.content.prepend(rootMarker);
    }
    return Array.from(shellTemplate.content.childNodes)
        .map((node) => node.toString())
        .join("")
        .trim();
}

function projectSlots(fragment: DocumentFragment, authored: Node[]): void {
    const used = new Set<string>();
    for (const slot of Array.from(fragment.querySelectorAll("slot"))) {
        const name = slot.getAttribute("name") ?? "";
        const assigned = used.has(name)
            ? []
            : authored.filter((node) => node.nodeType === 1 && ((node as Element).getAttribute("slot") ?? "") === name);
        used.add(name);
        const projected = assigned.length > 0 ? assigned : Array.from(slot.childNodes);
        for (const node of projected) {
            if (node.nodeType === 1) {
                const element = node as Element;
                if (element.localName === "slot") {
                    element.removeAttribute("slot");
                    continue;
                }
                addPartToken(element, name);
                element.removeAttribute("slot");
            }
        }
        slot.replaceWith(...projected);
    }
}

function addPartToken(element: Element, name: string): void {
    if (!name) {
        return;
    }
    const tokens = new Set((element.getAttribute("part") ?? "").split(/\s+/u).filter(Boolean));
    tokens.add(name);
    element.setAttribute("part", [...tokens].join(" "));
}
