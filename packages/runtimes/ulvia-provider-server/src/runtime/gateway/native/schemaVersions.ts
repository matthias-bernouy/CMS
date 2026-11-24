import type { GatewaySchemaVersions, GatewayRouteResolver, GatewayAccessProbe } from "@bernouy/cms-gateway";
import { GatewayError } from "@bernouy/cms-gateway";
import type { SchemaVersionStore } from "@bernouy/cms-gateway/provider/server";
import { parseSchemaDescriptor } from "@bernouy/ulvia-contracts/resolution";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
export function createSchemaVersionAuthority(
    siteId: string,
    routes: GatewayRouteResolver,
    access: GatewayAccessProbe,
    store: SchemaVersionStore,
): GatewaySchemaVersions {
    return {
        seal: async ({ actor, target, descriptor }) => {
            const route = await routes.resolve(siteId, target.contractId);
            const installation = route?.installation.installation;
            const admission = route?.requestedRelease.admission;
            const capability = admission?.release.capabilities.find(({ id }) => id === target.capabilityId);
            if (
                !route ||
                !installation ||
                !admission ||
                !capability?.schemaResolver ||
                installation.id !== target.installationId ||
                installation.accountId !== target.accountId ||
                installation.endpoint !== target.endpoint ||
                route.installation.observation?.report.instanceId !== target.instanceId ||
                admission.release.version !== target.version ||
                admission.digest !== target.digest
            ) {
                throw new GatewayError("stale_route", "Schema source no longer matches its exact selected target");
            }
            await access.assertAuthorized({
                siteId,
                contractId: target.contractId,
                capabilityId: target.capabilityId,
                actor,
            });
            const { schema, ...wire } = descriptor;
            const validated = parseSchemaDescriptor({ ...wire, schemaJson: canonicalizeIJson(schema) });
            if (!(await routes.isCurrent(route))) {
                throw new GatewayError("stale_route", "Schema source changed during validation");
            }
            await store.seal(
                {
                    siteId,
                    providerId: installation.providerId,
                    installationId: installation.id,
                    instanceId: target.instanceId,
                    contractId: target.contractId,
                    resolverId: target.capabilityId,
                },
                validated,
            );
        },
    };
}
