import { GatewayPinnedArtifacts } from "./dispatch/GatewayPinnedArtifacts";
import { resolveSelectedRelease } from "./dispatch/resolveSelectedRelease";
import { GatewayAuthorityReads } from "./dispatch/GatewayAuthorityReads";
import type { ReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import type { ProviderManifestCatalogue } from "@bernouy/cms-repository/providers/catalogue";
import type { ProviderInstallationStore } from "@bernouy/cms-repository/providers/installations";
import { capabilityGranted } from "@bernouy/cms-repository/providers/selections";
import type { ProviderExecutionStateReader } from "@bernouy/cms-repository/providers/selections";
import type { ContractSelectionStore } from "@bernouy/cms-repository/providers/selections";
import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";
import type { GatewayRoute, GatewayRouteResolver } from "cms-gateway/invocation/interfaces/Invocation";
import { GatewayError } from "cms-gateway/invocation/core/GatewayError";

export interface CatalogueGatewayRouteResolverOptions {
    readonly selections: ContractSelectionStore;
    readonly executionState?: ProviderExecutionStateReader;
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
    readonly #installationHints = new Map<string, string>();

    constructor(options: CatalogueGatewayRouteResolverOptions) {
        this.#options = options;
        this.#artifacts = new GatewayPinnedArtifacts(options.releases, options.manifests);
    }

    async resolve(siteId: string, contractId: string, reads?: GatewayAuthorityReads): Promise<GatewayRoute | null> {
        if (!reads && this.#options.executionState) {
            const initial = await this.capture(siteId, contractId);
            const route = await this.resolveInitial(siteId, contractId, initial);
            if (route && !(await this.isCurrent(route))) {
                throw new GatewayError("stale_route", "selection or dependency changed during route lookup");
            }
            return route;
        }
        return reads
            ? reads.route(this, siteId, contractId, () => this.resolveInitial(siteId, contractId, reads))
            : this.resolveInitial(siteId, contractId);
    }

    /** Initial lookup only; a transport using it must retain its independent final dispatch fence. */
    capture(siteId: string, contractId: string, installationIds: readonly string[] = []) {
        const reads = new GatewayAuthorityReads(siteId);
        if (!this.#options.executionState) {
            return Promise.resolve(reads);
        }
        const hint = this.#installationHints.get(`${siteId}\0${contractId}`);
        return GatewayAuthorityReads.capture(
            siteId,
            this.#options.selections,
            this.#options.installations,
            this.#options.executionState,
            [...new Set([...installationIds, ...(hint ? [hint] : [])])],
        );
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
        if (this.#installationHints.size >= 256) {
            this.#installationHints.delete(this.#installationHints.keys().next().value!);
        }
        // A lookup hint only chooses IDs for the next fresh read; it never authorizes execution.
        this.#installationHints.set(`${siteId}\0${contractId}`, selection.installationId);
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
        return (await this.checkAuthority(route)).current;
    }

    /** A new read for the final fence, independent from any initial preparation context. */
    async checkAuthority(route: GatewayRoute, capabilityId?: string): Promise<{ current: boolean; granted: boolean }> {
        const { siteId, contractId, installationId } = route.selection;
        const state = this.#options.executionState
            ? await this.#options.executionState.read(siteId, [installationId])
            : await Promise.all([
                  this.#options.selections.get(siteId),
                  this.#options.installations.get({ siteId, installationId }),
              ]).then(([selections, installation]) => ({
                  selections,
                  installations: installation ? [installation] : [],
              }));
        const stored = state.selections;
        const current = state.installations.find((item) => item.installation.id === installationId);
        const granted = Boolean(
            stored && (capabilityId === undefined || capabilityGranted(stored.grants, contractId, capabilityId)),
        );
        const selection = stored?.plan.selections.find((item) => item.contractId === contractId);
        if (
            !selection ||
            !current ||
            current.installation.siteId !== siteId ||
            selection.siteId !== siteId ||
            selection.version !== route.selection.version ||
            selection.digest !== route.selection.digest ||
            selection.installationId !== installationId ||
            canonicalizeIJson(current.installation) !== canonicalizeIJson(route.installation.installation)
        ) {
            return { current: false, granted };
        }
        return {
            current:
                !readyForSelection(route.installation, route.selection) || readyForSelection(current, route.selection),
            granted,
        };
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
