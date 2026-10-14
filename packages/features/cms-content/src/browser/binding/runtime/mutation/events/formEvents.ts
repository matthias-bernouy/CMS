export type FormMutationEventCallbacks = {
    onSubmit: (event: SubmitEvent) => void;
};

export function listenFormMutationEvents(source: Element, callbacks: FormMutationEventCallbacks): () => void {
    const form = asOwnerForm(source) ?? source.closest("form");
    const listener = callbacks.onSubmit as EventListener;
    form?.addEventListener("submit", listener);
    return () => {
        form?.removeEventListener("submit", listener);
    };
}

function asOwnerForm(source: Element): HTMLFormElement | null {
    const ctor = source.ownerDocument.defaultView?.HTMLFormElement ?? globalThis.HTMLFormElement;
    return typeof ctor === "function" && source instanceof ctor ? (source as HTMLFormElement) : null;
}
