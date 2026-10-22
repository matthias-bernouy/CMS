import { getProviderInstallationReadiness } from "@bernouy/cms-repository/providers/installations";
import type { GatewayRoute } from "cms-gateway/invocation/interfaces/Invocation";
import { GatewayError } from "cms-gateway/invocation/core/GatewayError";

export function resolveRoute(route: GatewayRoute, siteId: string, contractId: string, now: string, maxAgeMs: number) {
    const { selection, release, manifest, installation } = route;
    const approved = installation.installation;
    const document = release.admission.release;
    const provider = manifest.admission.manifest;
    const requested = validateLineage(route, contractId);
    if (
        selection.siteId !== siteId ||
        selection.installationId !== approved.id ||
        approved.siteId !== siteId ||
        document.contractId !== selection.contractId ||
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
            (endpoint.protocol !== "https:" && endpoint.protocol !== "http:")
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
            item.contractId === selection.contractId &&
            item.version === selection.version &&
            item.digest === selection.digest,
    );
    if (!claim) {
        throw new GatewayError("invalid_route", "approved manifest does not claim the selected release");
    }
    const readiness = getProviderInstallationReadiness(installation, now, maxAgeMs);
    if (
        readiness.status !== "observed" ||
        !readiness.readyImplementations.some(
            (item) =>
                item.contractId === selection.contractId &&
                item.version === selection.version &&
                item.digest === selection.digest,
        )
    ) {
        throw new GatewayError("not_ready", "selected provider release has no fresh ready observation");
    }
    const requestedAdmission = route.requestedRelease.admission;
    if (
        requestedAdmission.release.contractId !== requested.contractId ||
        requestedAdmission.release.version !== requested.version ||
        requestedAdmission.digest !== requested.digest ||
        requestedAdmission.release.name !== requested.name ||
        JSON.stringify(requested.capabilityIds) !==
            JSON.stringify(requestedAdmission.release.capabilities.map((capability) => capability.id))
    ) {
        throw new GatewayError("invalid_route", "requested contract does not match its exact lineage artifact");
    }
    return requestedAdmission.release;
}

function validateLineage(route: GatewayRoute, requestedContractId: string) {
    const { lineage, selection, release } = route;
    const concrete = lineage[0];
    if (
        !concrete ||
        concrete.contractId !== selection.contractId ||
        concrete.version !== selection.version ||
        concrete.digest !== selection.digest ||
        concrete.digest !== release.admission.digest ||
        concrete.name !== release.admission.release.name ||
        JSON.stringify(concrete.capabilityIds) !==
            JSON.stringify(release.admission.release.capabilities.map((capability) => capability.id))
    ) {
        throw new GatewayError("invalid_route", "selected contract lineage does not start at the selected release");
    }
    for (let index = 0; index < lineage.length; index += 1) {
        const current = lineage[index]!;
        const parent = lineage[index + 1];
        if (
            (parent &&
                (!current.extends ||
                    current.extends.contractId !== parent.contractId ||
                    current.extends.version !== parent.version ||
                    current.extends.digest !== parent.digest)) ||
            (!parent && current.extends)
        ) {
            throw new GatewayError("invalid_route", "selected contract lineage is not an exact parent chain");
        }
    }
    const requested = lineage.find((entry) => entry.contractId === requestedContractId);
    if (!requested) {
        throw new GatewayError("invalid_route", "selected contract does not implement the requested contract");
    }
    return requested;
}
