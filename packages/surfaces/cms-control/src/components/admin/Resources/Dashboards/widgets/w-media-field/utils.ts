export function numberData(value: string | undefined): number | null {
    if (value === undefined) {
        return null;
    }
    const number = Number(value);
    return Number.isInteger(number) ? number : null;
}

export function tileFromEvent(event: Event): HTMLElement | null {
    return (event.target as Element | null)?.closest<HTMLElement>("[data-media-tile]") ?? null;
}

export function localId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
