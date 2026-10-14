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
