let acknowledged: HTMLFormElement | undefined;

export function acknowledgeForm(form: HTMLFormElement | undefined, render: () => void): void {
    const previous = acknowledged;
    acknowledged = form;
    try {
        render();
    } finally {
        acknowledged = previous;
    }
}

/** A saved field must accept server normalization even when the server value stayed unchanged. */
export function acknowledgesControl(element: Element): boolean {
    return Boolean(
        acknowledged && (acknowledged.contains(element) || (element as HTMLInputElement).form === acknowledged),
    );
}
