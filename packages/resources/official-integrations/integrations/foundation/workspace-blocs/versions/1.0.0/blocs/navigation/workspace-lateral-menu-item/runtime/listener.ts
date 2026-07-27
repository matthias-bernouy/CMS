export function handleKeydown(host: HTMLElement, anchor: HTMLAnchorElement | null, event: KeyboardEvent): void {
    if (host.hasAttribute("disabled") || !["Enter", " "].includes(event.key) || event.target !== host) {
        return;
    }
    event.preventDefault();
    anchor?.click();
}
