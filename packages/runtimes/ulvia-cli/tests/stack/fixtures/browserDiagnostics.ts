import type { Page } from "playwright";

/** Failure-only diagnostics: no query strings, credentials, headers or response bodies. */
export function captureCapabilityFailures(page: Page): () => string {
    const failures: string[] = [];
    const record = (message: string) => {
        failures.push(message);
        if (failures.length > 24) {
            failures.shift();
        }
    };
    page.on("response", async (response) => {
        const path = new URL(response.url()).pathname;
        if (response.status() < 400 || !path.startsWith("/.cms/")) {
            return;
        }
        const value = (await response.json().catch(() => null)) as { error?: { code?: unknown } } | null;
        const code = typeof value?.error?.code === "string" ? value.error.code.slice(0, 80) : "unknown";
        record(`${response.request().method()} ${path}: ${response.status()} ${code}`);
    });
    page.on("requestfailed", (request) => {
        const path = new URL(request.url()).pathname;
        if (path.startsWith("/.cms/")) {
            record(`${request.method()} ${path}: transport failure`);
        }
    });
    return () => failures.join("\n") || "(none)";
}
