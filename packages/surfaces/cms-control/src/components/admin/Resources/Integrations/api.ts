import type {
    BrowserTab,
    IntegrationAnswerValue,
    IntegrationImportPayload,
    IntegrationInstallationDetail,
    IntegrationUpgradeVersions,
} from "./model";

export type IntegrationImportResponse = {
    installation?: {
        id: string;
        label: string;
    };
    run?: {
        id: string;
        runNumber: number;
        status: string;
    };
};

export type IntegrationPageLink = {
    path: string;
    title: string;
};

export function basePath(): string {
    const raw = document.querySelector('meta[name="basePath"]')?.getAttribute("content") ?? "";
    return raw.replace(/\/+$/, "");
}

export function route(path: string): string {
    return `${basePath()}${path}`;
}

export type IntegrationRoute =
    | { view: "list"; tab: BrowserTab }
    | { view: "installation"; id: string }
    | { view: "setup"; kind: string };

export function currentIntegrationRoute(): IntegrationRoute {
    const params = new URL(window.location.href).searchParams;
    const installation = params.get("integration")?.trim();
    if (installation) {
        return { view: "installation", id: installation };
    }
    const setup = params.get("setup")?.trim();
    if (setup) {
        return { view: "setup", kind: setup };
    }
    return { view: "list", tab: params.get("tab") === "catalogue" ? "catalogue" : "installed" };
}

export function integrationRouteUrl(next: IntegrationRoute): string {
    const params = new URLSearchParams();
    if (next.view === "installation") {
        params.set("integration", next.id);
    } else if (next.view === "setup") {
        params.set("setup", next.kind);
    } else if (next.tab === "catalogue") {
        params.set("tab", "catalogue");
    }
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return route(`/admin/integrations${suffix}`);
}

export function pushIntegrationRoute(next: IntegrationRoute): void {
    history.pushState(null, "", integrationRouteUrl(next));
}

export function replaceIntegrationRoute(next: IntegrationRoute): void {
    history.replaceState(null, "", integrationRouteUrl(next));
}

export async function importIntegration(payload: IntegrationImportPayload): Promise<IntegrationImportResponse> {
    const result = await postJson<IntegrationImportResponse>(route("/api/integrations/import"), payload);
    document.dispatchEvent(new Event("integration:updated", { bubbles: true }));
    return result;
}

export async function getIntegrationInstallation(id: string): Promise<IntegrationInstallationDetail> {
    return getJson(`${route("/api/integrations/installations")}?id=${encodeURIComponent(id)}`);
}

export async function rerunIntegrationInstallation(
    id: string,
    answers?: Record<string, IntegrationAnswerValue>,
): Promise<void> {
    const body = answers ? { answers } : {};
    await postJson(`${route("/api/integrations/installations/rerun")}?id=${encodeURIComponent(id)}`, body);
    document.dispatchEvent(new Event("integration:updated", { bubbles: true }));
    document.dispatchEvent(new Event("cms-source:reload", { bubbles: true }));
}

export async function getPageLinks(): Promise<IntegrationPageLink[]> {
    return getJson(route("/api/page/links?visible=published"));
}

export async function integrationUpgradeVersions(id: string): Promise<IntegrationUpgradeVersions> {
    return getJson(`${route("/api/integrations/installations/versions")}?id=${encodeURIComponent(id)}`);
}

export async function upgradeIntegrationInstallation(id: string, version: string): Promise<void> {
    await postJson(`${route("/api/integrations/installations/upgrade")}?id=${encodeURIComponent(id)}`, { version });
    document.dispatchEvent(new Event("integration:updated", { bubbles: true }));
    document.dispatchEvent(new Event("cms-source:reload", { bubbles: true }));
}

export class IntegrationApiError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
        this.name = "IntegrationApiError";
    }
}

async function getJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
        throw await responseError(response);
    }
    return response.json() as Promise<T>;
}

async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw await responseError(response);
    }
    return response.json() as Promise<T>;
}

async function responseError(response: Response): Promise<IntegrationApiError> {
    const fallback = `Request failed (HTTP ${response.status})`;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
        const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
        const message =
            typeof body?.error === "string" ? body.error : typeof body?.message === "string" ? body.message : null;
        return new IntegrationApiError(response.status, message?.slice(0, 500) || fallback);
    }
    const text = (await response.text()).trim();
    return new IntegrationApiError(response.status, text && !text.startsWith("<") ? text.slice(0, 500) : fallback);
}
