import type { BlocCleanup, BlocMount } from "./Bloc";
import { CMS_BLOC_FORM_CONTROL_READY_EVENT, installBlocFormControlProvider } from "./BlocFormControl";

export const CMS_BLOC_ATTRIBUTE = "cms-bloc";

const definitions = new Map<string, BlocMount | null>();
const mounted = new WeakMap<HTMLElement, BlocCleanup | null>();
let observer: MutationObserver | null = null;

export function registerBloc(id: string, definition: { readonly mount?: BlocMount }): void {
    definitions.set(id, definition.mount ?? null);
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
    if (!id || !definitions.has(id)) {
        return;
    }
    const cleanupFormControl = installBlocFormControlProvider(root);
    const cleanupBehavior = definitions.get(id)?.(root);
    mounted.set(root, () => {
        cleanupBehavior?.();
        cleanupFormControl();
    });
    root.dispatchEvent(new CustomEvent(CMS_BLOC_FORM_CONTROL_READY_EVENT, { bubbles: true }));
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
