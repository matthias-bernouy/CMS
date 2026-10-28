import { GatewayPinnedArtifacts } from "./dispatch/GatewayPinnedArtifacts";
import { resolveSelectedRelease } from "./dispatch/resolveSelectedRelease";
import type { GatewayAuthorityReads } from "./dispatch/GatewayAuthorityReads";
import type { ReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
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
    // Lookup hints belong to this instance-bound resolver, never to a global authority cache.
    readonly #artifacts: GatewayPinnedArtifacts;
    readonly #selectionHints = new Map<string, string>();

    constructor(options: CatalogueGatewayRouteResolverOptions) {
        this.#options = options;
        this.#artifacts = new GatewayPinnedArtifacts(options.releases, options.manifests);
    }

    resolve(siteId: string, contractId: string, reads?: GatewayAuthorityReads): Promise<GatewayRoute | null> {
        return reads
            ? reads.route(this, siteId, contractId, () => this.resolveInitial(siteId, contractId, reads))
            : this.resolveInitial(siteId, contractId);
    }

    private async resolveInitial(
        siteId: string,
        contractId: string,
        reads?: GatewayAuthorityReads,
    ): Promise<GatewayRoute | null> {
        const selected = await resolveSelectedRelease(
            this.#options,
            siteId,
            contractId,
            this.#selectionHints,
            reads,
            this.#artifacts,
        );
        if (!selected) {
            return null;
        }
        const { selection, release, requestedRelease, lineage } = selected;
        const installation = await (reads
            ? reads.installation(this.#options.installations, siteId, selection.installationId)
            : this.#options.installations.get({ siteId, installationId: selection.installationId }));
        if (!installation) {
            throw new GatewayError("invalid_route", "selected provider installation is missing");
        }
        const manifest = await this.#artifacts.manifest(installation.installation.approval.manifestDigest);
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
        // An explicit preparation context is speculative; its consumer must perform the live dispatch fence.
        if (!reads && !(await this.isCurrent(route))) {
            throw new GatewayError("stale_route", "selection or dependency changed during route lookup");
        }
        return route;
    }

    /** Selected capability metadata does not expose transport configuration or attest Provider readiness. */
    async describe(siteId: string, contractId: string) {
        const selected = await resolveSelectedRelease(this.#options, siteId, contractId, this.#selectionHints);
        if (!selected) {
            return null;
        }
        const current = await this.#options.selections.get(siteId);
        const selection = current?.plan.selections.find((item) => item.contractId === selected.selection.contractId);
        if (
            current?.revision !== selected.revision ||
            canonicalizeIJson(selection ?? null) !== canonicalizeIJson(selected.selection)
        ) {
            throw new GatewayError("stale_route", "selection changed while describing capabilities");
        }
        return selected.requestedRelease;
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
