export function form(html: string): HTMLFormElement {
    const host = document.createElement("div");
    host.innerHTML = html.trim();
    document.body.append(host);
    return host.querySelector("form")!;
}

export function withEmptyFormData<T>(callback: () => T): T {
    const NativeFormData = globalThis.FormData;
    class EmptyFormData extends NativeFormData {
        constructor() {
            super();
        }
    }
    globalThis.FormData = EmptyFormData as typeof FormData;
    try {
        return callback();
    } finally {
        globalThis.FormData = NativeFormData;
    }
}
