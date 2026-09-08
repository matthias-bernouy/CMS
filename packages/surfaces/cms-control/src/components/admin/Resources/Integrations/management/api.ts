import { route } from "../api";

export async function managementRequest<T>(id: string, operation: "action", body: unknown): Promise<T> {
    const url = `${route(`/api/integrations/management/${operation}`)}?id=${encodeURIComponent(id)}`;
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(detail?.error ?? `Request failed (HTTP ${response.status})`);
    }
    return response.json() as Promise<T>;
}
