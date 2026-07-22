import { readFileSync } from "node:fs";
import { join } from "node:path";

const realFetch = globalThis.fetch;

export function resetSettingsTest(): void {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
    window.history.replaceState(null, "", "/");
}

export function settingsHtml(relativePath: string): string {
    const path = join(import.meta.dir, "../../../src/static/admin/_access", relativePath);
    return readFileSync(path, "utf8").replaceAll("{{BASE_PATH}}", "");
}

export function json(data: unknown): Response {
    return new Response(JSON.stringify(data), {
        headers: { "content-type": "application/json" },
    });
}

export async function waitFor(predicate: () => boolean, tries = 50): Promise<void> {
    for (let i = 0; i < tries; i++) {
        if (predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}
