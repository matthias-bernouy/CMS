import { CatalogueGatewayRouteResolver } from "@bernouy/cms-gateway";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { admitProviderManifest } from "@bernouy/cms-repository/providers";
import { gatewayRoute, NOW } from "../../fixtures";

export async function specializedRoute(now = new Date().toISOString()) {
    const parentRoute = await gatewayRoute();
    const releases = new InMemoryReleaseCatalogue();
    await releases.publish(parentRoute.release.admission);
    const child = await admitContractRelease({
        ...parentRoute.release.admission.release,
        contractId: "catalog.sql",
        version: "2.0.0",
        name: "SQL Catalog",
        capabilities: [
            {
                ...parentRoute.release.admission.release.capabilities[0],
                id: "sql.configure",
                bindings: [
                    {
                        id: "http",
                        ...parentRoute.release.admission.release.capabilities[0]!.bindings[0],
                        path: "/sql/configuration",
                    },
                ],
            },
        ],
        extends: {
            contractId: "catalog",
            version: "1.0.0",
            digest: parentRoute.release.admission.digest,
        },
    });
    const childRelease = await releases.publish(child);
    const manifestAdmission = await admitProviderManifest(
        {
            ...parentRoute.manifest.admission.manifest,
            implementations: [{ contractId: "catalog.sql", version: "2.0.0", digest: child.digest, requires: [] }],
        },
        releases,
    );
    const manifest = { admission: manifestAdmission, publishedAt: NOW };
    const selection = {
        ...parentRoute.selection,
        version: "2.0.0",
        contractId: "catalog.sql",
        digest: child.digest,
    };
    const installation = {
        ...parentRoute.installation,
        installation: {
            ...parentRoute.installation.installation,
            approval: {
                ...parentRoute.installation.installation.approval,
                manifestDigest: manifestAdmission.digest,
            },
        },
        observation: {
            ...parentRoute.installation.observation!,
            report: {
                ...parentRoute.installation.observation!.report,
                manifest: { version: "1.0.0", digest: manifestAdmission.digest },
                implementations: [
                    { contractId: "catalog.sql", version: "2.0.0", digest: child.digest, status: "ready" as const },
                ],
            },
        },
    };
    installation.observation.observedAt = now;
    const routes = new CatalogueGatewayRouteResolver({
        selections: { get: async () => ({ plan: { selections: [selection] } }) } as never,
        installations: { get: async () => installation } as never,
        releases,
        manifests: { findByDigest: async () => manifest } as never,
    });
    return { routes, childRelease, installation, selection };
}
