import type { EventOwner, EventReadScope } from "cms-events/interfaces/definition";
import type { EventServices } from "cms-events/interfaces/services";
import { eventHash, eventDefinitionDigest, pageSize } from "./identity";
import { EventsError } from "./errors";
export { isJsonEventSchema as jsonEventSchema } from "@bernouy/ulvia-contracts";

/** Stored definitions are immutable projections of admitted installed contracts, never authored schemas. */
export class EventDefinitions {
    constructor(private readonly services: EventServices) {}
    async resolve(owner: EventOwner, eventType: string) {
        const contract = await this.services.authority.contract(owner);
        const event = contract.events.find(({ definition }) => definition.id === eventType);
        if (!event || event.owner.contractId !== owner.namespace) {
            throw new EventsError("NOT_FOUND");
        }
        const digest = eventDefinitionDigest(event.definition);
        const definition = {
            id: eventHash({ owner, eventType, eventDigest: digest }),
            owner: structuredClone(owner),
            eventType,
            version: contract.release.version,
            digest,
            declaringContract: event.owner,
            schema: event.definition.schema,
            sensitive: event.definition.sensitive,
            ...(event.definition.filterKeys ? { filterKeys: event.definition.filterKeys } : {}),
            retired: false,
            createdAt: new Date(this.services.now()).toISOString(),
        };
        await this.services.authority.assertSource(definition);
        return this.services.store.putDefinition(definition);
    }
    async get(id: string, owner: EventReadScope | null = null, existing = false) {
        const definition = await this.services.store.definition(id);
        if (
            !definition ||
            (owner &&
                (definition.owner.siteId !== owner.siteId ||
                    definition.owner.installationId !== owner.installationId ||
                    (owner.namespace !== undefined && definition.owner.namespace !== owner.namespace)))
        ) {
            throw new EventsError("NOT_FOUND");
        }
        if (definition.retired && !existing) {
            throw new EventsError("DEFINITION_RETIRED");
        }
        return definition;
    }
    async list(owner: EventReadScope | null, cursor: string | undefined, limit: number) {
        pageSize(limit);
        return this.services.store.definitions(owner, cursor, limit);
    }
}
