import type { ReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import type { ProviderManifestCatalogue } from "@bernouy/cms-repository/providers/catalogue";
import type { ProviderInstallationStore } from "@bernouy/cms-repository/providers/installations";
import type { ContractSelectionStore } from "@bernouy/cms-repository/providers/selections";
import type {
    GatewayRoute,
    GatewayRouteResolver,
    GatewayRouteRevisionSource,
} from "cms-gateway/invocation/interfaces/Invocation";
import { GatewayError } from "cms-gateway/invocation/core/GatewayError";

export interface CatalogueGatewayRouteResolverOptions {
    readonly selections: ContractSelectionStore;
    readonly revisions: GatewayRouteRevisionSource;
    readonly installations: ProviderInstallationStore;
    readonly releases: ReleaseCatalogue;
    readonly manifests: ProviderManifestCatalogue;
}

/** Resolves exact persisted pins, then fences the aggregate against concurrent changes. */
export class CatalogueGatewayRouteResolver implements GatewayRouteResolver {
    readonly #options: CatalogueGatewayRouteResolverOptions;

    constructor(options: CatalogueGatewayRouteResolverOptions) {
        this.#options = options;
    }

    async resolve(siteId: string, contractId: string): Promise<GatewayRoute | null> {
        const revision = await this.#options.revisions.capture(siteId);
        const stored = await this.#options.selections.get(siteId);
        const selection = stored?.plan.selections.find((item) => item.contractId === contractId);
        if (!stored || !selection) {
            return null;
        }
        const installation = await this.#options.installations.get({
            siteId,
            installationId: selection.installationId,
        });
        if (!installation) {
            throw new GatewayError("invalid_route", "selected provider installation is missing");
        }
        const [release, manifest] = await Promise.all([
            this.#options.releases.get(contractId, selection.version),
            this.#options.manifests.findByDigest(installation.installation.approval.manifestDigest),
        ]);
        if (!release || !manifest) {
            throw new GatewayError("invalid_route", "selected release or approved manifest is missing");
        }
        const route: GatewayRoute = {
            selection,
            release,
            manifest,
            installation,
            revision,
        };
        if (!(await this.isCurrent(route))) {
            throw new GatewayError("stale_route", "selection or dependency changed during route lookup");
        }
        return route;
    }

    async isCurrent(route: GatewayRoute): Promise<boolean> {
        if (!route.revision) {
            return false;
        }
        return this.#options.revisions.isCurrent(route.selection.siteId, route.revision);
    }
}
