import { parseQuery } from "cms-content/blocs/core/markup/bindings/source";
import { BINDING_CORE_TAG, QUERY_ATTR, SOURCE_SUCCESS_RELOAD_ATTR } from "../../../core/attrs";

type Reader = {
    url: () => string;
    generation: () => number;
    reload: (acknowledge?: HTMLFormElement) => Promise<boolean>;
};
const readers = new WeakMap<Element, Reader>();

export function connectSourceReload(source: Element, reader: Reader): () => void {
    readers.set(source, reader);
    return () => {
        if (readers.get(source) === reader) {
            readers.delete(source);
        }
    };
}

export function connectQueryReload(query: Element, identity: () => string, reload: () => Promise<boolean>): () => void {
    const reader: Reader = {
        generation: () => 0,
        url: identity,
        reload,
    };
    return connectSourceReload(query, reader);
}

/** Reload exactly one active read source, retaining its current presentation. */
export async function reloadSource(source: Element): Promise<boolean> {
    const reader = readers.get(source);
    if (!reader || !source.isConnected || !reader.url()) {
        throw new Error("reloadSource requires an active automatic source.");
    }
    return reader.reload();
}

export function submissionReload(form: HTMLFormElement) {
    const name = form.getAttribute(SOURCE_SUCCESS_RELOAD_ATTR)?.trim();
    if (!name) {
        return null;
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        throw new Error("cms-source-success-reload must identify one query by name.");
    }
    const core = form.closest(BINDING_CORE_TAG);
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
        throw new Error("cms-source-success-reload requires one active query with that name in the same binding core.");
    }
    const url = reader.url();
    if (!url) {
        throw new Error("cms-source-success-reload requires a valid query.");
    }
    const generation = reader.generation();
    const current = () =>
        source.isConnected &&
        readers.get(source) === reader &&
        reader.url() === url &&
        reader.generation() === generation;
    return { source, current, reload: () => (current() ? reader.reload(form) : Promise.resolve(false)) };
}
