import { parseQuery } from "cms-content/blocs/core/markup/bindings/source";
import { parseCmsSourceSuccessReload } from "cms-content/blocs/core/validation/nativeBindings/formValues";
import { BINDING_CORE_TAG, MUTATION_INVALIDATES_ATTR, QUERY_ATTR, SOURCE_SUCCESS_RELOAD_ATTR } from "../../core/attrs";

type Reader = {
    url: () => string;
    generation: () => number;
    reload: (acknowledge?: HTMLFormElement) => Promise<boolean>;
};
const readers = new WeakMap<Element, Reader>();
let acknowledged: HTMLFormElement | undefined;

/** Let one successful form refresh re-apply unchanged server values to its controls. */
export function withFormAcknowledgement(form: HTMLFormElement | undefined, render: () => void): void {
    const previous = acknowledged;
    acknowledged = form;
    try {
        render();
    } finally {
        acknowledged = previous;
    }
}

export function acknowledgesControl(element: Element): boolean {
    return Boolean(
        acknowledged && (acknowledged.contains(element) || (element as HTMLInputElement).form === acknowledged),
    );
}

function connectReader(source: Element, reader: Reader): () => void {
    readers.set(source, reader);
    return () => {
        if (readers.get(source) === reader) {
            readers.delete(source);
        }
    };
}

export function connectQueryReload(
    query: Element,
    identity: () => string,
    reload: (acknowledge?: HTMLFormElement) => Promise<boolean>,
): () => void {
    const reader: Reader = {
        generation: () => 0,
        url: identity,
        reload,
    };
    return connectReader(query, reader);
}

export function formMutationReload(form: HTMLFormElement) {
    const rawNames = form.getAttribute(MUTATION_INVALIDATES_ATTR) ?? form.getAttribute(SOURCE_SUCCESS_RELOAD_ATTR);
    if (!rawNames?.trim()) {
        return null;
    }
    const names = parseCmsSourceSuccessReload(rawNames);
    if (!names) {
        throw new Error("cms-mutation-invalidates must identify one to eight unique queries by name.");
    }
    const core = form.closest(BINDING_CORE_TAG);
    const selected = names.map((name) => selectReader(core, name));
    const source = selected[0]!.source;
    const current = () => selected.every((selection) => isCurrent(selection));
    return {
        source,
        current,
        reload: async () => {
            if (!current()) {
                return false;
            }
            const outcomes = await Promise.all(selected.map(({ reader }) => reader.reload(form)));
            return outcomes.every(Boolean);
        },
    };
}

type SelectedReader = { source: Element; reader: Reader; url: string; generation: number };

function selectReader(core: Element | null, name: string): SelectedReader {
    const matches = core
        ? Array.from(core.querySelectorAll(`[${QUERY_ATTR}]`)).filter(
              (element) =>
                  parseQuery(element.getAttribute(QUERY_ATTR) ?? "")?.name === name &&
                  element.closest(BINDING_CORE_TAG) === core,
          )
        : [];
    const source = matches.length === 1 ? matches[0]! : null;
    const reader = source ? readers.get(source) : undefined;
    if (!source || !reader || source.closest(BINDING_CORE_TAG) !== core || !source.hasAttribute(QUERY_ATTR)) {
        throw new Error(`cms-mutation-invalidates requires one active query named ${JSON.stringify(name)}.`);
    }
    const url = reader.url();
    if (!url) {
        throw new Error(`cms-mutation-invalidates requires query ${JSON.stringify(name)} to be valid.`);
    }
    return { source, reader, url, generation: reader.generation() };
}

function isCurrent(selection: SelectedReader): boolean {
    const { source, reader, url, generation } = selection;
    return (
        source.isConnected &&
        readers.get(source) === reader &&
        reader.url() === url &&
        reader.generation() === generation
    );
}
