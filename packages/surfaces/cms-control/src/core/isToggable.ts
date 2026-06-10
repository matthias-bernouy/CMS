export function isToggable(el: HTMLElement): el is HTMLElementToggable {
    return 'open' in el && typeof (el as any).open === 'function';
}