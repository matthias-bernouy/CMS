export function syncDescription(
    input: HTMLInputElement | null,
    hint: HTMLElement | null,
    counter: HTMLElement | null,
): void {
    if (!input) {
        return;
    }
    const ids = [hint && !hint.hidden && hint.textContent ? hint.id : "", counter && !counter.hidden ? counter.id : ""]
        .filter(Boolean)
        .join(" ");
    if (ids) {
        input.setAttribute("aria-describedby", ids);
    } else {
        input.removeAttribute("aria-describedby");
    }
}
