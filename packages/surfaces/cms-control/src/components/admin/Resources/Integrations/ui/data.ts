import { route } from "../api";
import type { IntegrationBrowserHost, IntegrationDefinition, IntegrationInstallationRow } from "../model";

export function startBoundSources(host: IntegrationBrowserHost): void {
    const definitions = host.query<HTMLElement>("[data-definitions-source]");
    const installations = host.query<HTMLElement>("[data-installations-source]");
    const catalogue = host.query<HTMLElement>("[data-catalogue-source]");
    definitions.setAttribute("cms-source", `${route("/api/integrations/list")} as definitions`);
    installations.setAttribute("cms-source", `${route("/api/integrations/installations")} as installations`);
    const scope = window.location.pathname.endsWith("/admin/blocs") ? "collections" : "sources";
    catalogue.setAttribute(
        "cms-source",
        `${route("/api/integrations/catalogue")}?scope=${scope}&q=#{integrationSearch}&category=#{integrationCategory} as catalogue`,
    );
    host.observer = new MutationObserver(() => readBoundData(host));
    host.observer.observe(definitions, { attributes: true, childList: true, subtree: true });
    host.observer.observe(installations, { attributes: true, childList: true, subtree: true });
    readBoundData(host);
}

export function disconnectBoundSources(host: IntegrationBrowserHost): void {
    host.observer?.disconnect();
    host.observer = null;
    for (const waiter of host.waiters) {
        clearTimeout(waiter.timeout);
        waiter.reject(new Error("Integration data source disconnected."));
    }
    host.waiters = [];
}

export function readBoundData(host: IntegrationBrowserHost): void {
    let changed = false;
    const definitions = parseArray<IntegrationDefinition>(
        host.querySelector<HTMLElement>("[data-definitions-json]")?.dataset.definitionsJson ?? "",
    );
    if (definitions) {
        host.definitions = definitions;
        host.definitionsLoaded = true;
        changed = true;
    }
    const installations = parseArray<IntegrationInstallationRow>(
        host.querySelector<HTMLElement>("[data-installations-json]")?.dataset.installationsJson ?? "",
    );
    if (installations) {
        host.installations = installations;
        host.installationsLoaded = true;
        changed = true;
    }
    if (!changed) {
        return;
    }
    if (host.installationsLoaded) {
        host.renderAll();
    }
    resolveWaiters(host);
}

export function retryBoundSources(host: IntegrationBrowserHost): void {
    host.ownerDocument.dispatchEvent(new Event("cms-source:reload"));
}

export function waitForBoundData(
    host: IntegrationBrowserHost,
    predicate: () => boolean,
    timeoutMs = 5000,
): Promise<void> {
    if (predicate()) {
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        const waiter = {
            predicate,
            resolve,
            reject,
            timeout: setTimeout(() => {
                host.waiters = host.waiters.filter((item) => item !== waiter);
                reject(new Error("Timed out waiting for integration data reload."));
            }, timeoutMs),
        };
        host.waiters.push(waiter);
    });
}

function resolveWaiters(host: IntegrationBrowserHost): void {
    for (const waiter of [...host.waiters]) {
        if (!waiter.predicate()) {
            continue;
        }
        clearTimeout(waiter.timeout);
        host.waiters = host.waiters.filter((item) => item !== waiter);
        waiter.resolve();
    }
}

function parseArray<T>(value: string): T[] | null {
    if (!value) {
        return null;
    }
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
        return [];
    }
}
