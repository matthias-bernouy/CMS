export const emitChange = (host: HTMLElement, files: FileList | null) => {
    host.dispatchEvent(
        new CustomEvent("change", {
            bubbles: true,
            composed: true,
            detail: { files },
        }),
    );
};
