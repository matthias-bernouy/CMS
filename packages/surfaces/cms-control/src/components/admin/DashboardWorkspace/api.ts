import { route } from "../Resources/Dashboards/api";
import type { DashboardRuntimeModel, DashboardSessionModel } from "./types";

export async function loadDashboardSession(): Promise<DashboardSessionModel> {
    return request("/api/dashboard-session");
}

export async function loadDashboardRuntime(id: string): Promise<DashboardRuntimeModel> {
    return request(`/api/dashboard-session/dashboard?id=${encodeURIComponent(id)}`);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(route(path), {
        ...init,
        cache: "no-store",
        headers: {
            Accept: "application/json",
            ...(init.body ? { "Content-Type": "application/json" } : {}),
            ...init.headers,
        },
    });
    if (!response.ok) {
        throw new Error((await response.text()) || `Request failed (${response.status})`);
    }
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}
