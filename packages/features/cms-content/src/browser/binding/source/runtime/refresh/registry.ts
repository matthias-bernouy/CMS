import { BINDING_CORE_TAG, SOURCE_ATTR, SOURCE_SUCCESS_RELOAD_ATTR } from "../../../core/attrs";
import { sourceTrigger } from "../../sourceEvents";

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

/** Reload exactly one active read source, retaining its current presentation. */
export async function reloadSource(source: Element): Promise<boolean> {
    const reader = readers.get(source);
    if (!reader || !source.isConnected || !reader.url()) {
        throw new Error("reloadSource requires an active automatic source.");
    }
    return reader.reload();
}

export function submissionReload(form: HTMLFormElement) {
    const selector = form.getAttribute(SOURCE_SUCCESS_RELOAD_ATTR)?.trim();
    if (!selector) {
        return null;
    }
    if (!/^#[A-Za-z_][\w:.-]*$/.test(selector)) {
        throw new Error("cms-source-success-reload must identify one source by #id.");
    }
    const core = form.closest(BINDING_CORE_TAG);
    const matches = core
        ? Array.from(core.querySelectorAll("[id]")).filter(
              (el) => el.getAttribute("id") === selector.slice(1) && el.closest(BINDING_CORE_TAG) === core,
          )
        : [];
    const source = matches.length === 1 ? matches[0]! : null;
    const reader = source ? readers.get(source) : undefined;
    if (
        !source ||
        !reader ||
        source.closest(BINDING_CORE_TAG) !== core ||
        !source.hasAttribute(SOURCE_ATTR) ||
        sourceTrigger(source) !== "auto"
    ) {
        throw new Error("cms-source-success-reload requires one active read source in the same binding core.");
    }
    const url = reader.url();
    if (!url) {
        throw new Error("cms-source-success-reload requires a source URL.");
    }
    const generation = reader.generation();
    const current = () =>
        source.isConnected &&
        readers.get(source) === reader &&
        reader.url() === url &&
        reader.generation() === generation;
    return { source, current, reload: () => (current() ? reader.reload(form) : Promise.resolve(false)) };
}
