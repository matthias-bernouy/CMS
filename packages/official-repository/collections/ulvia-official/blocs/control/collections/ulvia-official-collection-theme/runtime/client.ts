import type { ThemeDocument } from "./model";

export async function themeCapability(capabilityId: string, input: unknown): Promise<ThemeDocument> {
    const response = await fetch(`/.cms/call/ulvia.cms.design/${capabilityId}`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
        throw new Error(
            typeof record.message === "string"
                ? record.message
                : typeof record.error === "string"
                  ? record.error
                  : `Theme request failed (${response.status})`,
        );
    }
    return body as ThemeDocument;
}
