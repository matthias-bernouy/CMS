import type { CapabilityDefinition, ContractRelease } from "@bernouy/ulvia-contracts";
import { resolvedSchemaNodes } from "@bernouy/ulvia-contracts/resolution";
import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";
import type { GatewayRoute, GatewayRouteResolver } from "../../interfaces/Invocation";
import { resolveRoute } from "../resolveRoute";
import { GatewayError } from "../GatewayError";
export interface SchemaResolverRoutes {
    readonly route: GatewayRoute;
    readonly routes: GatewayRouteResolver;
    readonly now: string;
    readonly maxObservationAgeMs: number;
}
/** Inherited resolvers remain pinned to their declaring contract on the same installation. */
export async function resolverRoutes(schema: UlviaSchema, release: ContractRelease, scope: SchemaResolverRoutes) {
    const capabilities: CapabilityDefinition[] = [...release.capabilities];
    const targets = new Map(
        release.capabilities.map(({ id }) => [
            id,
            {
                contractId: release.contractId,
                version: release.version,
                digest: scope.route.requestedRelease.admission.digest,
            },
        ]),
    );
    const names = [...new Set(resolvedSchemaNodes(schema).map(({ schema }) => schema.resolver))];
    for (const id of names) {
        if (targets.has(id)) {
            continue;
        }
        const ancestor = scope.route.lineage.find((entry) => entry.capabilityIds.includes(id));
        const route = ancestor ? await scope.routes.resolve(scope.route.selection.siteId, ancestor.contractId) : null;
        if (
            !ancestor ||
            !route ||
            route.selection.installationId !== scope.route.selection.installationId ||
            route.installation.installation.accountId !== scope.route.installation.installation.accountId ||
            route.requestedRelease.admission.digest !== ancestor.digest
        ) {
            throw new GatewayError(
                "stale_route",
                "Inherited schema resolver no longer matches the pinned installation",
            );
        }
        const declared = resolveRoute(
            route,
            scope.route.selection.siteId,
            ancestor.contractId,
            scope.now,
            scope.maxObservationAgeMs,
        );
        const capability = declared.capabilities.find((entry) => entry.id === id);
        if (!capability) {
            throw new GatewayError("invalid_route", "Inherited schema resolver is not declared");
        }
        capabilities.push(capability);
        targets.set(id, { contractId: ancestor.contractId, version: ancestor.version, digest: ancestor.digest });
    }
    return { capabilities, targets };
}
