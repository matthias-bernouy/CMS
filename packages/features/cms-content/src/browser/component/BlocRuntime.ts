import type { BlocCleanup, BlocMount } from "./BlocBehavior";

export const CMS_BLOC_ATTRIBUTE = "cms-bloc";

const definitions = new Map<string, BlocMount>();
const mounted = new WeakMap<HTMLElement, BlocCleanup | null>();
const styles = new Set<string>();
let observer: MutationObserver | null = null;

export function registerBloc(id: string, definition: { readonly mount?: BlocMount; readonly style?: string }): void {
    if (definition.style && !styles.has(id)) {
        const style = document.createElement("style");
        style.setAttribute("data-cms-bloc-style", id);
        style.textContent = definition.style;
        document.head.append(style);
        styles.add(id);
    }
    if (definition.mount) {
        definitions.set(id, definition.mount);
    }
    activate(document);
}

function activate(root: ParentNode): void {
    for (const element of blocRoots(root)) {
        mount(element);
    }
    if (!observer) {
        observer = new MutationObserver((records) => {
            for (const record of records) {
                for (const node of Array.from(record.removedNodes)) {
                    cleanupTree(node);
                }
                for (const node of Array.from(record.addedNodes)) {
                    if (node instanceof HTMLElement) {
                        mount(node);
                        activate(node);
                    }
                }
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }
}

function blocRoots(root: ParentNode): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(`[${CMS_BLOC_ATTRIBUTE}]`));
}

function mount(root: HTMLElement): void {
    if (mounted.has(root)) {
        return;
    }
    const id = root.getAttribute(CMS_BLOC_ATTRIBUTE);
    const definition = id ? definitions.get(id) : undefined;
    if (!definition) {
        return;
    }
    mounted.set(root, definition(root) ?? null);
}

function cleanupTree(node: Node): void {
    if (!(node instanceof HTMLElement)) {
        return;
    }
    cleanup(node);
    for (const root of blocRoots(node)) {
        cleanup(root);
    }
}

function cleanup(root: HTMLElement): void {
    const cleanup = mounted.get(root);
    cleanup?.();
    mounted.delete(root);
}
