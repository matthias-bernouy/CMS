import { resolveSchema, containsResolvedSchema } from "@bernouy/ulvia-contracts/resolution";
import type { EventDefinition } from "cms-events/interfaces/definition";
import type { EventServices } from "cms-events/interfaces/services";
/** Events supplies source authority; the shared schema engine owns typing. */
export async function resolveEventSchema(
    services: EventServices,
    definition: EventDefinition,
    value: unknown,
    allowLatest = false,
) {
    if (!containsResolvedSchema(definition.schema)) {
        return { schema: definition.schema, bindings: [] };
    }
    await services.authority.assertSource(definition);
    const contract = await services.authority.contract(definition.owner);
    return resolveSchema(definition.schema, value, {
        capabilities: contract.capabilities.map(({ definition }) => definition),
        allowLatest,
        invoke: (resolver, input) => services.authority.schema(definition, resolver.id, input),
        // The authenticated resolver receiver owns the durable version seal.
        seal: async () => undefined,
    });
}
