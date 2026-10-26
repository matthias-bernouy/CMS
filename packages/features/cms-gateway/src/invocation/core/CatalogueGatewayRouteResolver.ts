import { resolveContract, type ReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import type { ProviderManifestCatalogue } from "@bernouy/cms-repository/providers/catalogue";
import type { ProviderInstallationStore } from "@bernouy/cms-repository/providers/installations";
import type { ContractSelectionStore } from "@bernouy/cms-repository/providers/selections";
import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";
import type { GatewayRoute, GatewayRouteResolver } from "cms-gateway/invocation/interfaces/Invocation";
import { GatewayError } from "cms-gateway/invocation/core/GatewayError";

export interface CatalogueGatewayRouteResolverOptions {
    readonly selections: ContractSelectionStore;
    readonly installations: ProviderInstallationStore;
    readonly releases: ReleaseCatalogue;
    readonly manifests: ProviderManifestCatalogue;
}

/** Immutable artifacts are pinned; live checks read only the selected route's mutable records. */
export class CatalogueGatewayRouteResolver implements GatewayRouteResolver {
    readonly #options: CatalogueGatewayRouteResolverOptions;

    constructor(options: CatalogueGatewayRouteResolverOptions) {
        this.#options = options;
    }

    async resolve(siteId: string, contractId: string): Promise<GatewayRoute | null> {
        const stored = await this.#options.selections.get(siteId);
        if (!stored) {
            return null;
        }
        let selected:
            | {
                  selection: (typeof stored.plan.selections)[number];
                  release: NonNullable<Awaited<ReturnType<ReleaseCatalogue["get"]>>>;
                  requestedRelease: NonNullable<Awaited<ReturnType<ReleaseCatalogue["get"]>>>;
                  lineage: Awaited<ReturnType<typeof resolveContract>>["lineage"];
              }
            | undefined;
        for (const selection of stored.plan.selections) {
            const release = await this.#options.releases.get(selection.contractId, selection.version);
            if (!release || release.admission.digest !== selection.digest) {
                throw new GatewayError("invalid_route", "selected release is missing or has a different digest");
            }
            const lineage = (await resolveContract(this.#options.releases, release.admission)).lineage;
            const requestedIndex = lineage.findIndex((candidate) => candidate.release.contractId === contractId);
            if (requestedIndex >= 0) {
                const requested = lineage[requestedIndex]!.release;
                const requestedRelease =
                    requestedIndex === 0
                        ? release
                        : await this.#options.releases.get(requested.contractId, requested.version);
                const expectedDigest = requestedIndex === 0 ? selection.digest : lineage[requestedIndex]!.digest;
                if (!requestedRelease || requestedRelease.admission.digest !== expectedDigest) {
                    throw new GatewayError("invalid_route", "requested ancestor release is missing or changed");
                }
                selected = { selection, release, requestedRelease, lineage };
                break;
            }
        }
        if (!selected) {
            return null;
        }
        const { selection, release, requestedRelease, lineage } = selected;
        const installation = await this.#options.installations.get({
            siteId,
            installationId: selection.installationId,
        });
        if (!installation) {
            throw new GatewayError("invalid_route", "selected provider installation is missing");
        }
        const manifest = await this.#options.manifests.findByDigest(installation.installation.approval.manifestDigest);
        if (!manifest) {
            throw new GatewayError("invalid_route", "approved manifest is missing");
        }
        const route: GatewayRoute = {
            selection,
            release,
            requestedRelease,
            manifest,
            installation,
            lineage: lineage.map(({ release: candidate, digest }) => ({
                contractId: candidate.contractId,
                version: candidate.version,
                digest,
                name: candidate.name,
                capabilityIds: candidate.capabilities.map((capability) => capability.id),
                ...(candidate.extends ? { extends: candidate.extends } : {}),
            })),
        };
        if (!(await this.isCurrent(route))) {
            throw new GatewayError("stale_route", "selection or dependency changed during route lookup");
        }
        return route;
    }

    async isCurrent(route: GatewayRoute): Promise<boolean> {
        const { siteId, contractId, installationId } = route.selection;
        const [stored, current] = await Promise.all([
            this.#options.selections.get(siteId),
            this.#options.installations.get({ siteId, installationId }),
        ]);
        const selection = stored?.plan.selections.find((item) => item.contractId === contractId);
        if (
            !selection ||
            !current ||
            selection.siteId !== siteId ||
            selection.version !== route.selection.version ||
            selection.digest !== route.selection.digest ||
            selection.installationId !== installationId ||
            canonicalizeIJson(current.installation) !== canonicalizeIJson(route.installation.installation)
        ) {
            return false;
        }
        return !readyForSelection(route.installation, route.selection) || readyForSelection(current, route.selection);
    }
}

function readyForSelection(record: GatewayRoute["installation"], selection: GatewayRoute["selection"]): boolean {
    return (
        record.observation?.report.implementations.some(
            (item) =>
                item.contractId === selection.contractId &&
                item.version === selection.version &&
                item.digest === selection.digest &&
                item.status === "ready",
        ) ?? false
    );
}
