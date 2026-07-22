const EDITOR_FORM_GUARD_KEY = "__cmsEditorFormGuardInstalled";

export function installEditorFormGuard(document: Document): void {
    const state = document as Document & { [EDITOR_FORM_GUARD_KEY]?: boolean };
    if (state[EDITOR_FORM_GUARD_KEY]) {
        return;
    }
    state[EDITOR_FORM_GUARD_KEY] = true;
    document.addEventListener(
        "submit",
        (event) => {
            if (!event.defaultPrevented) {
                event.preventDefault();
            }
        },
        true,
    );
}

export function cssViewportSize(value: string | null): string | null {
    const size = value?.trim();
    if (!size) {
        return null;
    }
    return /^\d+$/.test(size) ? `${size}px` : size;
}
