import type { IntegrationHealthEnvelope, IntegrationSettingsResponse } from "@bernouy/cms-integrations";
import { route } from "../api";

export async function managementRequest<T>(
    id: string,
    operation: "settings" | "health" | "action",
    body?: unknown,
    refresh = false,
): Promise<T> {
    const url = `${route(`/api/integrations/management/${operation}`)}?id=${encodeURIComponent(id)}${refresh ? "&refresh=true" : ""}`;
    const response = await fetch(
        url,
        body === undefined
            ? undefined
            : {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body),
              },
    );
    if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(detail?.error ?? `Request failed (HTTP ${response.status})`);
    }
    return response.json() as Promise<T>;
}
export const readSettings = (id: string) => managementRequest<IntegrationSettingsResponse>(id, "settings");
export const readHealth = (id: string, refresh = false) =>
    managementRequest<IntegrationHealthEnvelope>(id, "health", undefined, refresh);
