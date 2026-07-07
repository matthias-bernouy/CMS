import { route } from "../api";
import type { IntegrationBrowserHost, IntegrationDefinition, IntegrationInstanceRow } from "../model";

export function startBoundSources(host: IntegrationBrowserHost): void {
    const definitions = host.query<HTMLElement>("[data-definitions-source]");
    const instances = host.query<HTMLElement>("[data-instances-source]");
    definitions.setAttribute("cms-source", `${route("/api/integrations/list")} as definitions`);
    instances.setAttribute("cms-source", `${route("/api/integrations/instances")} as instances`);
    host.observer = new MutationObserver(() => readBoundData(host));
    host.observer.observe(definitions, { attributes: true, childList: true, subtree: true });
    host.observer.observe(instances, { attributes: true, childList: true, subtree: true });
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
    const instances = parseArray<IntegrationInstanceRow>(
        host.querySelector<HTMLElement>("[data-instances-json]")?.dataset.instancesJson ?? "",
    );
    if (instances) {
        host.instances = instances;
        host.instancesLoaded = true;
        changed = true;
    }
    if (!changed || !host.definitionsLoaded || !host.instancesLoaded) return;
    host.renderAll();
    resolveWaiters(host);
}

export function waitForBoundData(
    host: IntegrationBrowserHost,
    predicate: () => boolean,
    timeoutMs = 5000,
): Promise<void> {
    if (predicate()) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const waiter = {
            predicate,
            resolve,
            reject,
            timeout: setTimeout(() => {
                host.waiters = host.waiters.filter(item => item !== waiter);
                reject(new Error("Timed out waiting for integration data reload."));
            }, timeoutMs),
        };
        host.waiters.push(waiter);
    });
}

function resolveWaiters(host: IntegrationBrowserHost): void {
    for (const waiter of [...host.waiters]) {
        if (!waiter.predicate()) continue;
        clearTimeout(waiter.timeout);
        host.waiters = host.waiters.filter(item => item !== waiter);
        waiter.resolve();
    }
}

function parseArray<T>(value: string): T[] | null {
    if (!value) return null;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed as T[] : [];
    } catch {
        return [];
    }
}
