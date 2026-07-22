export function dispatchTokenChange(target: HTMLElement, value: string, values: string[], created: boolean): void {
    target.dispatchEvent(
        new CustomEvent("change", {
            bubbles: true,
            composed: true,
            detail: { value, values, created },
        }),
    );
}
