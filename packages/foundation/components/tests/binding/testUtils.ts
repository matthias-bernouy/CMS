export const realFetch = globalThis.fetch;

export function resetDom(): void {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
    document.getElementById("cms-binding-cloak")?.remove();
    location.href = "http://localhost/";
}

export function el(html: string): HTMLElement {
    const host = document.createElement("div");
    host.innerHTML = html.trim();
    return host.firstElementChild as HTMLElement;
}

export const text = (e: Element | null) => (e?.textContent ?? "").replace(/\s+/g, " ").trim();

export async function waitFor(predicate: () => boolean, tries = 50): Promise<void> {
    for (let i = 0; i < tries; i++) {
        if (predicate()) return;
        await new Promise((r) => setTimeout(r, 0));
    }
}

export async function settle(rounds = 8): Promise<void> {
    for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0));
}

export function res(status: number, body: string): Response {
    return { ok: status >= 200 && status < 300, status, text: async () => body } as unknown as Response;
}

export function respond(status: number, body: string): void {
    globalThis.fetch = (async () => res(status, body)) as unknown as typeof fetch;
}

export function routes(map: Record<string, () => Response>): void {
    globalThis.fetch = (async (url: string) => (map[url] ?? (() => res(404, "")))()) as unknown as typeof fetch;
}
