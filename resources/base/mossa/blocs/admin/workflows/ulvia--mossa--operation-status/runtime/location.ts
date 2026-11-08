export function validOperationId(value: string): boolean {
    return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu.test(value);
}

function resultKey(root: HTMLElement): string {
    const key = root.getAttribute("result-param")?.trim() ?? "";
    return /^[A-Za-z0-9_-]{1,100}$/u.test(key) ? key : "";
}

export function operationLink(root: HTMLElement, id: string): URL | null {
    const key = resultKey(root);
    if (!key || !validOperationId(id)) {
        return null;
    }
    const target = new URL(location.href);
    if (root.hasAttribute("tracking-only")) {
        target.search = "";
        target.hash = "";
    }
    target.searchParams.set(key, id);
    return target;
}

export function initialOperation(root: HTMLElement): string {
    const key = resultKey(root);
    const id = key ? (new URL(location.href).searchParams.get(key) ?? "") : "";
    return validOperationId(id) ? id : "";
}
