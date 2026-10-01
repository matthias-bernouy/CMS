import { compareSemVer } from "@bernouy/cms-repository/contracts/compatibility";
import type { Catalogue, Collections, Dashboards, HealthReport, HealthRow, Provider, Providers } from "./types";

export type { Catalogue, Collections, Dashboards, HealthReport, HealthRow, Providers } from "./types";

export const PROVIDER_STALE_AFTER_MS = 120_000;

export function healthReport(
    base: string,
    providers: Providers | null,
    catalogue: Catalogue | null,
    collections: Collections | null,
    dashboards: Dashboards | null,
    now = Date.now(),
): HealthReport {
    const report = {
        providers: providerRows(base, providers, now),
        sources: sourceRows(base, providers, catalogue, now),
        collections: collectionRows(base, collections),
        dashboards: dashboardRows(base, dashboards, providers),
    };
    return {
        ...report,
        issues: Object.values(report)
            .flat()
            .filter((row) => row.tone === "warning" || row.tone === "danger").length,
    };
}

function providerRows(base: string, data: Providers | null, now: number): HealthRow[] {
    if (!data) {
        return [unavailable("Provider state", `${base}/admin/settings/providers`)];
    }
    return data.installations.map((provider) => {
        const stale = isProviderStale(provider, now);
        const state =
            provider.status !== "enabled"
                ? capitalize(provider.status)
                : !provider.observedAt
                  ? "Not checked"
                  : stale
                    ? "Check overdue"
                    : "Healthy";
        return {
            name: `${provider.providerId} · ${provider.accountId}`,
            detail: provider.observedAt
                ? `Last checked ${relativeTime(provider.observedAt, now)}`
                : "No observation recorded",
            state,
            tone: provider.status !== "enabled" || !provider.observedAt ? "danger" : stale ? "warning" : "good",
            href: `${base}/admin/settings/providers?provider=${encodeURIComponent(provider.id)}`,
        };
    });
}

function sourceRows(base: string, data: Providers | null, catalogue: Catalogue | null, now: number): HealthRow[] {
    if (!data) {
        return [unavailable("Source state", `${base}/admin/sources`)];
    }
    return data.selected.map((selection) => {
        const provider = data.installations.find((item) => item.id === selection.installationId);
        const implementation = provider?.contracts.find(
            (item) =>
                item.contractId === selection.contractId &&
                item.version === selection.version &&
                item.digest === selection.digest,
        );
        const newer = catalogue?.available.some(
            (item) =>
                item.kind === "contract" &&
                item.id === selection.contractId &&
                compareSemVer(item.version, selection.version) > 0,
        );
        const unavailableProvider = provider?.status !== "enabled" || !provider;
        const stale = provider ? isProviderStale(provider, now) : false;
        const state = unavailableProvider
            ? "Provider unavailable"
            : stale
              ? "Check overdue"
              : implementation?.status !== "ready"
                ? capitalize(implementation?.status ?? "Not reported")
                : newer
                  ? "Update available"
                  : "Ready";
        return {
            name: selection.contractId,
            detail: `v${selection.version} · ${provider ? `${provider.providerId} / ${provider.accountId}` : "missing provider"}`,
            state,
            tone: unavailableProvider || !implementation ? "danger" : stale || newer ? "warning" : "good",
            href: `${base}/admin/sources?source=${encodeURIComponent(selection.contractId)}`,
        };
    });
}

function collectionRows(base: string, data: Collections | null): HealthRow[] {
    if (!data) {
        return [unavailable("Collection state", `${base}/admin/collections`)];
    }
    return data.installed.map((installed) => {
        const newer = data.releases.some(
            (item) =>
                item.collectionId === installed.collectionId && compareSemVer(item.version, installed.version) > 0,
        );
        return {
            name: installed.collectionId,
            detail: `v${installed.version}`,
            state: newer ? "Update available" : "Up to date",
            tone: newer ? "warning" : "good",
            href: `${base}/admin/collections/${encodeURIComponent(`installed:${installed.collectionId}`)}/overview`,
        };
    });
}

function dashboardRows(base: string, data: Dashboards | null, providers: Providers | null): HealthRow[] {
    if (!data) {
        return [unavailable("Dashboard state", `${base}/admin/dashboards`)];
    }
    const selected = new Set(providers?.selected.map((selection) => selection.contractId) ?? []);
    return data.dashboards.map((dashboard) => {
        const missing = (dashboard.sourceContracts ?? []).filter((contractId) => !selected.has(contractId));
        return {
            name: dashboard.name,
            detail: !dashboard.enabled
                ? "Hidden from members"
                : missing.length
                  ? `Connect ${missing.join(", ")} in Sources`
                  : `${dashboard.members.length} member${dashboard.members.length === 1 ? "" : "s"} assigned`,
            state: !dashboard.enabled
                ? "Inactive"
                : missing.length
                  ? "Source missing"
                  : dashboard.members.length
                    ? "Active"
                    : "No members",
            tone: !dashboard.enabled
                ? "neutral"
                : missing.length
                  ? "danger"
                  : dashboard.members.length
                    ? "good"
                    : "warning",
            href: `${base}/admin/dashboards?dashboardId=${encodeURIComponent(dashboard.id)}`,
        };
    });
}

function isProviderStale(provider: Provider, now: number): boolean {
    if (!provider.observedAt) {
        return true;
    }
    const checkedAt = Date.parse(provider.observedAt);
    return !Number.isFinite(checkedAt) || now - checkedAt > PROVIDER_STALE_AFTER_MS;
}

function relativeTime(value: string, now: number): string {
    const delta = Math.max(0, now - Date.parse(value));
    if (delta < 60_000) {
        return "less than a minute ago";
    }
    const minutes = Math.floor(delta / 60_000);
    if (minutes < 60) {
        return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    }
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

function unavailable(name: string, href: string): HealthRow {
    return { name, detail: "This area could not be checked", state: "Unavailable", tone: "danger", href };
}

function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}
