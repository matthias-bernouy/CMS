import { getProviderInstallationReadiness } from "@bernouy/cms-repository/providers/installations";
import type { GatewayRoute } from "../interfaces/Invocation";
import { GatewayError } from "./GatewayError";

export function resolveRoute(route: GatewayRoute, siteId: string, contractId: string, now: string, maxAgeMs: number) {
    const { selection, release, manifest, installation } = route;
    const approved = installation.installation;
    const document = release.admission.release;
    const provider = manifest.admission.manifest;
    if (
        !route.revision ||
        selection.siteId !== siteId ||
        selection.contractId !== contractId ||
        selection.installationId !== approved.id ||
        approved.siteId !== siteId ||
        document.contractId !== contractId ||
        document.version !== selection.version ||
        release.admission.digest !== selection.digest ||
        approved.approval.manifestDigest !== manifest.admission.digest ||
        approved.approval.manifestVersion !== provider.version ||
        approved.providerId !== provider.providerId
    ) {
        throw new GatewayError("invalid_route", "selected release, manifest, and installation pins disagree");
    }
    if (approved.status !== "enabled") {
        throw new GatewayError("installation_unavailable", "provider installation is not enabled");
    }
    let origin: string;
    try {
        const endpoint = new URL(approved.endpoint);
        origin = endpoint.origin;
        if (
            approved.endpoint !== origin ||
            endpoint.username ||
            endpoint.password ||
            (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && isLoopback(endpoint.hostname)))
        ) {
            throw new TypeError("not a canonical origin");
        }
    } catch {
        throw new GatewayError("invalid_route", "provider endpoint is invalid");
    }
    if (!provider.endpoint.allowedOrigins.includes(origin)) {
        throw new GatewayError("invalid_route", "provider endpoint is outside the approved origins");
    }
    const claim = provider.implementations.some(
        (item) =>
            item.contractId === contractId && item.version === selection.version && item.digest === selection.digest,
    );
    if (!claim) {
        throw new GatewayError("invalid_route", "approved manifest does not claim the selected release");
    }
    const readiness = getProviderInstallationReadiness(installation, now, maxAgeMs);
    if (
        readiness.status !== "observed" ||
        !readiness.readyImplementations.some(
            (item) =>
                item.contractId === contractId &&
                item.version === selection.version &&
                item.digest === selection.digest,
        )
    ) {
        throw new GatewayError("not_ready", "selected provider release has no fresh ready observation");
    }
    return document;
}

function isLoopback(hostname: string): boolean {
    return hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(hostname);
}
