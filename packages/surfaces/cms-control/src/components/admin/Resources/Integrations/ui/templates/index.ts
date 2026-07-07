import browserHtml from "./browser.html" with { type: "text" };
import detailHtml from "./detail.html" with { type: "text" };
import iconsHtml from "./icons.html" with { type: "text" };
import importingHtml from "./importing.html" with { type: "text" };
import itemsHtml from "./items.html" with { type: "text" };
import setupHtml from "./setup.html" with { type: "text" };

const registry = document.createElement("template");
registry.innerHTML = [browserHtml, detailHtml, iconsHtml, importingHtml, itemsHtml, setupHtml].join("");

export function cloneElement<T extends HTMLElement = HTMLElement>(name: string): T {
    const template = registry.content.querySelector<HTMLTemplateElement>(`template[data-template="${name}"]`);
    const element = template?.content.firstElementChild?.cloneNode(true);
    if (!(element instanceof HTMLElement)) throw new Error(`Missing integration template: ${name}`);
    return element as T;
}

export function cloneIcon(name: string): Node {
    const template = registry.content.querySelector<HTMLTemplateElement>(`template[data-icon="${name}"]`)
        ?? registry.content.querySelector<HTMLTemplateElement>('template[data-icon="grid"]');
    const icon = template?.content.firstElementChild?.cloneNode(true);
    if (!icon) throw new Error(`Missing integration icon: ${name}`);
    return icon;
}

export function text(root: ParentNode, selector: string, value: unknown): void {
    const element = root.querySelector<HTMLElement>(selector);
    if (element) element.textContent = String(value ?? "");
}

export function fillIcon(root: ParentNode, selector: string, icon: string): void {
    const element = root.querySelector<HTMLElement>(selector);
    if (element) element.replaceChildren(cloneIcon(icon));
}
