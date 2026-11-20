import type { AdmittedContractRelease } from "@bernouy/ulvia-contracts";
import { collectMcpContracts, mcpCatalogueEntries } from "@bernouy/cms-gateway/mcp";
import type { InstallationGateway } from "repository/application/installations/interfaces/gateway";
import { InstallationError } from "../errors";

type Identity = Readonly<{ contractId: string; version: string; digest: string }>;
type Index = ReadonlyMap<string, Identity>;
const indices = new WeakMap<InstallationGateway, { key: string; index: Index }>();

/** Only immutable tool identities are retained. Current dependency revisions fence every lookup. */
export async function resolveMcpContract(
    gateway: InstallationGateway,
    ids: readonly string[],
    name: string,
): Promise<AdmittedContractRelease | null> {
    const before = (await gateway.catalogueRevision?.()) ?? null;
    const key = before === null ? null : JSON.stringify([gateway.siteId, ids, before]);
    const cached = indices.get(gateway);
    if (key !== null && cached?.key === key) {
        const identity = cached.index.get(name);
        if (!identity) {
            return null;
        }
        const route = await gateway.routes.resolve(gateway.siteId, identity.contractId);
        const current = route?.requestedRelease.admission;
        if (
            !current ||
            current.digest !== identity.digest ||
            current.release.version !== identity.version ||
            current.release.contractId !== identity.contractId
        ) {
            throw new InstallationError("CORE_UNAVAILABLE");
        }
        return current;
    }
    const contracts = await collectMcpContracts(ids, async (id) => {
        const route = await gateway.routes.resolve(gateway.siteId, id);
        if (!route) {
            throw new InstallationError("CORE_UNAVAILABLE");
        }
        return route.requestedRelease.admission;
    });
    const entries = mcpCatalogueEntries(contracts, true, true);
    const index: Index = new Map(
        entries.map((entry) => {
            const contract = contracts.find((candidate) => candidate.release.contractId === entry.contractId)!;
            return [
                entry.toolName,
                { contractId: entry.contractId, version: contract.release.version, digest: contract.digest },
            ];
        }),
    );
    const after = (await gateway.catalogueRevision?.()) ?? null;
    const bytes =
        key === null
            ? Infinity
            : 128 +
              key.length * 2 +
              [...index].reduce(
                  (size, [tool, pin]) =>
                      size + 512 + (tool.length + pin.contractId.length + pin.version.length + pin.digest.length) * 2,
                  0,
              );
    if (key !== null && before === after && bytes <= 1024 ** 2) {
        indices.set(gateway, { key, index });
    }
    // A changed revision only prevents retention. Do not retry or alter the reference read result.
    const identity = index.get(name);
    return identity
        ? (contracts.find((contract) => contract.release.contractId === identity.contractId) ?? null)
        : null;
}
