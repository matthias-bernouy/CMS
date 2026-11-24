import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import type { SubscriptionOwner } from "@bernouy/cms-gateway/events";
import type { EventServices } from "cms-events/interfaces/services";
import type { EventSubscriptionConfiguration } from "cms-events/interfaces/subscription";
import { validateEventFilter, filterKey } from "./filters";
import { EventDefinitions } from "./definitions";
import { eventHash, eventId, eventDigest, pageSize } from "./identity";
import { EventsError } from "./errors";
export class EventSubscriptions {
    constructor(private readonly services: EventServices) {}
    private async target(owner: SubscriptionOwner, config: EventSubscriptionConfiguration) {
        if (!/^[a-f0-9]{64}$/u.test(config.definitionId) || typeof config.enabled !== "boolean") {
            throw new EventsError("INVALID_INPUT");
        }
        eventDigest(config.definitionDigest);
        const definition = await new EventDefinitions(this.services).get(config.definitionId);
        if (definition.digest !== config.definitionDigest) {
            throw new EventsError("DEFINITION_CONFLICT");
        }
        await this.services.authority.assertSource(definition);
        validateEventFilter(definition, config.filterJson);
        const target = await this.services.authority.receiver(owner, config);
        if (
            target.installationId !== owner.installationId ||
            target.contractId !== owner.consumerContractId ||
            target.contractId !== config.delivery.contractId ||
            target.capabilityId !== config.delivery.capabilityId
        ) {
            throw new EventsError("FORBIDDEN");
        }
        return target;
    }
    async create(owner: SubscriptionOwner, id: string, configuration: EventSubscriptionConfiguration) {
        eventId(id);
        const config = structuredClone(configuration);
        const target = await this.target(owner, config);
        const now = new Date(this.services.now()).toISOString();
        const record = {
            ...config,
            id,
            owner: structuredClone(owner),
            target,
            revision: 1,
            filterKey: filterKey(config.filterJson),
            deleted: false,
            creationFingerprint: eventHash({ owner, config }),
            createdAt: now,
            updatedAt: now,
        };
        if (Buffer.byteLength(JSON.stringify(record)) > 32768) {
            throw new EventsError("CAPACITY_EXCEEDED");
        }
        const stored = await this.services.store.createSubscription(record);
        if (stored.deleted || stored.creationFingerprint !== record.creationFingerprint) {
            throw new EventsError("SUBSCRIPTION_CONFLICT");
        }
        return stored;
    }
    async get(owner: SubscriptionOwner, id: string) {
        eventId(id);
        const record = await this.services.store.subscription(owner, id);
        if (!record || record.deleted) {
            throw new EventsError("NOT_FOUND");
        }
        return record;
    }
    async list(owner: SubscriptionOwner, cursor: string | undefined, limit: number) {
        pageSize(limit);
        return this.services.store.subscriptions(owner, cursor, limit);
    }
    async update(
        owner: SubscriptionOwner,
        id: string,
        revision: number,
        configuration: EventSubscriptionConfiguration,
    ) {
        const current = await this.get(owner, id);
        if (current.revision !== revision) {
            throw new EventsError("REVISION_CONFLICT");
        }
        const config = structuredClone(configuration);
        const { enabled: _enabled, ...oldConfig } = {
            definitionId: current.definitionId,
            definitionDigest: current.definitionDigest,
            delivery: current.delivery,
            ...(current.filterJson === undefined ? {} : { filterJson: current.filterJson }),
            enabled: current.enabled,
        };
        const { enabled: _nextEnabled, ...newConfig } = config;
        const disableOnly = config.enabled === false && canonicalizeIJson(oldConfig) === canonicalizeIJson(newConfig);
        const target = disableOnly ? current.target : await this.target(owner, config);
        const { filterJson: _previousFilter, ...base } = current;
        const next = {
            ...base,
            ...config,
            filterKey: filterKey(config.filterJson),
            target,
            revision: revision + 1,
            updatedAt: new Date(this.services.now()).toISOString(),
        };
        if (Buffer.byteLength(JSON.stringify(next)) > 32768) {
            throw new EventsError("CAPACITY_EXCEEDED");
        }
        if (!(await this.services.store.replaceSubscription(next, revision))) {
            throw new EventsError("REVISION_CONFLICT");
        }
        return next;
    }
    async ensure(owner: SubscriptionOwner, id: string, revision: number, config: EventSubscriptionConfiguration) {
        const current = await this.services.store.subscription(owner, id);
        if (!current) {
            if (revision !== 0) {
                throw new EventsError("REVISION_CONFLICT");
            }
            return this.create(owner, id, config);
        }
        const actual = {
            definitionId: current.definitionId,
            definitionDigest: current.definitionDigest,
            ...(current.filterJson === undefined ? {} : { filterJson: current.filterJson }),
            enabled: current.enabled,
            delivery: current.delivery,
        };
        if (
            !current.deleted &&
            current.revision === revision + 1 &&
            canonicalizeIJson(actual) === canonicalizeIJson(config)
        ) {
            return current;
        }
        return this.update(owner, id, revision, config);
    }
    async remove(owner: SubscriptionOwner, id: string, revision: number) {
        const current = await this.get(owner, id);
        if (
            current.revision !== revision ||
            !(await this.services.store.replaceSubscription(
                {
                    ...current,
                    enabled: false,
                    deleted: true,
                    revision: revision + 1,
                    updatedAt: new Date(this.services.now()).toISOString(),
                },
                revision,
            ))
        ) {
            throw new EventsError("REVISION_CONFLICT");
        }
    }
    async cancel(owner: SubscriptionOwner, id: string) {
        eventId(id);
        await this.services.store.cancelSubscription(owner, id);
    }
}
