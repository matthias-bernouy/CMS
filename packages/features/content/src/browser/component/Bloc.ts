import { type BlocFormControl, requestBlocFormControl } from "./BlocFormControl";

export type BlocCleanup = () => void;
export type BlocMount = (root: HTMLElement) => void | BlocCleanup;

export type BlocScope = {
    readonly querySelector: <E extends Element = Element>(selectors: string) => E | null;
    readonly querySelectorAll: <E extends Element = Element>(selectors: string) => readonly E[];
    readonly queryBlocRoot: <E extends HTMLElement = HTMLElement>(id?: string) => E | null;
    readonly queryBlocRoots: <E extends HTMLElement = HTMLElement>(id?: string) => readonly E[];
    readonly getFormControl: <E extends BlocFormControl = BlocFormControl>(root: HTMLElement) => E | null;
};

/** Bind the ownership-safe DOM operations used by one mounted Bloc. */
export function createBlocScope(root: HTMLElement): BlocScope {
    return {
        querySelector: <E extends Element = Element>(selectors: string) => queryBlocElement<E>(root, selectors),
        querySelectorAll: <E extends Element = Element>(selectors: string) => queryBlocElements<E>(root, selectors),
        queryBlocRoot: <E extends HTMLElement = HTMLElement>(id?: string) => queryChildBlocRoot<E>(root, id),
        queryBlocRoots: <E extends HTMLElement = HTMLElement>(id?: string) => queryChildBlocRoots<E>(root, id),
        getFormControl: <E extends BlocFormControl = BlocFormControl>(controlRoot: HTMLElement) =>
            requestOwnedBlocFormControl<E>(root, controlRoot),
    };
}

/** Return descendants owned by this Bloc without crossing a nested Bloc boundary. */
function queryBlocElements<E extends Element = Element>(root: HTMLElement, selectors: string): readonly E[] {
    return Array.from(root.querySelectorAll<E>(selectors)).filter((element) => element.closest("[cms-bloc]") === root);
}

/** Return one descendant owned by this Bloc. */
function queryBlocElement<E extends Element = Element>(root: HTMLElement, selectors: string): E | null {
    return queryBlocElements<E>(root, selectors)[0] ?? null;
}

/** Return immediate nested Bloc roots without exposing their internal DOM. */
function queryChildBlocRoots<E extends HTMLElement = HTMLElement>(root: HTMLElement, id?: string): readonly E[] {
    return Array.from(root.querySelectorAll<E>("[cms-bloc]")).filter(
        (element) =>
            (!id || element.getAttribute("cms-bloc") === id) && element.parentElement?.closest("[cms-bloc]") === root,
    );
}

/** Return one immediate nested Bloc root. */
function queryChildBlocRoot<E extends HTMLElement = HTMLElement>(root: HTMLElement, id?: string): E | null {
    return queryChildBlocRoots<E>(root, id)[0] ?? null;
}

/** Request a native control only from this Bloc or one of its immediate child Blocs. */
function requestOwnedBlocFormControl<E extends BlocFormControl = BlocFormControl>(
    owner: HTMLElement,
    root: HTMLElement,
): E | null {
    if (root !== owner && root.parentElement?.closest("[cms-bloc]") !== owner) {
        return null;
    }
    return requestBlocFormControl(root) as E | null;
}

/** Observe a fixed attribute contract and return its cleanup function. */
export function observeBlocAttributes(
    root: HTMLElement,
    names: readonly string[],
    listener: (name: string, oldValue: string | null, newValue: string | null) => void,
): BlocCleanup {
    if (names.length === 0) {
        return () => undefined;
    }
    const allowed = new Set(names);
    const observer = new MutationObserver((records) => {
        for (const record of records) {
            const name = record.attributeName;
            if (name && allowed.has(name)) {
                listener(name, record.oldValue, root.getAttribute(name));
            }
        }
    });
    observer.observe(root, { attributes: true, attributeOldValue: true, attributeFilter: [...names] });
    return () => observer.disconnect();
}
