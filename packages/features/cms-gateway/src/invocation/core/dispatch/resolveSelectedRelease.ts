import { resolveContract } from "@bernouy/cms-repository/contracts/catalogue";
import type { ReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import type { CatalogueGatewayRouteResolverOptions } from "../CatalogueGatewayRouteResolver";
import type { GatewayAuthorityReads } from "./GatewayAuthorityReads";
import { GatewayError } from "../GatewayError";

export async function resolveSelectedRelease(
    options: CatalogueGatewayRouteResolverOptions,
    siteId: string,
    contractId: string,
    hints: Map<string, string>,
    reads?: GatewayAuthorityReads,
) {
    const stored = await (reads ? reads.selection(options.selections, siteId) : options.selections.get(siteId));
    if (!stored) {
        return null;
    }
    let selected:
        | {
              revision: number;
              selection: (typeof stored.plan.selections)[number];
              release: NonNullable<Awaited<ReturnType<ReleaseCatalogue["get"]>>>;
              requestedRelease: NonNullable<Awaited<ReturnType<ReleaseCatalogue["get"]>>>;
              lineage: Awaited<ReturnType<typeof resolveContract>>["lineage"];
          }
        | undefined;
    const hintKey = `${siteId}\0${contractId}`;
    const exact = stored.plan.selections.find((selection) => selection.contractId === contractId);
    const hinted = stored.plan.selections.find((selection) => selection.contractId === hints.get(hintKey));
    const preferred = exact ?? hinted;
    const candidates = preferred
        ? [preferred, ...stored.plan.selections.filter((selection) => selection !== preferred)]
        : stored.plan.selections;
    for (const selection of candidates) {
        const release = await options.releases.get(selection.contractId, selection.version);
        if (!release || release.admission.digest !== selection.digest) {
            throw new GatewayError("invalid_route", "selected release is missing or has a different digest");
        }
        const lineage = (await resolveContract(options.releases, release.admission)).lineage;
        const requestedIndex = lineage.findIndex((candidate) => candidate.release.contractId === contractId);
        if (requestedIndex >= 0) {
            const requested = lineage[requestedIndex]!.release;
            const requestedRelease =
                requestedIndex === 0 ? release : await options.releases.get(requested.contractId, requested.version);
            const expectedDigest = requestedIndex === 0 ? selection.digest : lineage[requestedIndex]!.digest;
            if (!requestedRelease || requestedRelease.admission.digest !== expectedDigest) {
                throw new GatewayError("invalid_route", "requested ancestor release is missing or changed");
            }
            selected = { selection, release, requestedRelease, lineage, revision: stored.revision };
            if (hints.size >= 512) {
                hints.delete(hints.keys().next().value!);
            }
            hints.set(hintKey, selection.contractId);
            break;
        }
    }
    if (!selected) {
        return null;
    }
    return selected;
}
