import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import { projectEventValue, DURABLE_EVENT_RECORD_LIMIT } from "@bernouy/cms-gateway/events";
import type { EventMessageContent } from "@bernouy/cms-gateway/events";
import type { EventOwner } from "cms-events/interfaces/definition";
import type { EventServices } from "cms-events/interfaces/services";
import type { EventPublication } from "cms-events/interfaces/store";
import { resolveEventSchema } from "./schema";
import { applySchemaBindings } from "@bernouy/ulvia-contracts/resolution";
import { eventRoutingKeys } from "./filters";
import { EventDefinitions } from "./definitions";
import { handoffEventPublication, preparePublicationBatch } from "./fanout";
import { eventHash, eventJson, eventId } from "./identity";
import { EventsError } from "./errors";
export class EventPublications {
    constructor(private readonly services: EventServices) {}
    async publish(
        owner: EventOwner,
        definitionId: string,
        producerEventId: string,
        payloadJson: string,
        causation: readonly string[] | (() => Promise<readonly string[]>) = [],
        initiatorProof?: string | (() => Promise<string | undefined>),
    ) {
        eventId(producerEventId);
        const definition = await new EventDefinitions(this.services).get(definitionId, owner, true);
        await this.services.authority.assertSource(definition);
        const input = eventJson(payloadJson);
        const proof = typeof initiatorProof === "function" ? await initiatorProof() : initiatorProof;
        if (proof !== undefined && !this.services.initiators) {
            throw new EventsError("FORBIDDEN");
        }
        const origin =
            proof === undefined
                ? undefined
                : await this.services.initiators!.verify(owner, definition, producerEventId, proof);
        const id = eventHash({ owner, eventType: definition.eventType, producerEventId });
        const fingerprint = this.services.fingerprint({
            owner,
            eventType: definition.eventType,
            producerEventId,
            payload: input,
            ...(origin ? { initiator: origin.fingerprint } : {}),
        });
        const existing = await this.services.store.publication(id);
        if (existing) {
            if (existing.fingerprint !== fingerprint) {
                throw new EventsError("PUBLICATION_CONFLICT");
            }
            return { occurrenceId: existing.occurrenceId, accepted: true };
        }
        const resolved = await resolveEventSchema(this.services, definition, input);
        const schema = resolved.schema;
        try {
            validateSchemaValue(schema, input);
        } catch {
            throw new EventsError("INVALID_INPUT");
        }
        if (definition.retired) {
            throw new EventsError("DEFINITION_RETIRED");
        }
        const parent = typeof causation === "function" ? await causation() : causation;
        if (parent.length > 32 || parent.some((entry) => !/^[a-f0-9]{64}$/u.test(entry))) {
            throw new EventsError("INVALID_INPUT");
        }
        const projected = definition.sensitive
            ? undefined
            : projectEventValue(applySchemaBindings(definition.schema, resolved.bindings, true), input);
        const occurrenceId = eventHash({ generation: crypto.randomUUID() });
        const content: EventMessageContent = {
            format: "ulvia-event/v1",
            occurrenceId,
            occurredAt: new Date(this.services.now()).toISOString(),
            ...(origin ? { initiator: origin.initiator } : {}),
            source: {
                installationId: owner.installationId,
                contractId: owner.namespace,
                definitionId,
                eventType: definition.eventType,
                version: definition.version,
                digest: definition.digest,
            },
            ...(resolved.bindings.length
                ? {
                      schemas: resolved.bindings.map(({ path, declaration, descriptor }) => ({
                          path,
                          resolver: declaration.resolver,
                          resourceId: descriptor.resourceId,
                          version: descriptor.version,
                          digest: descriptor.digest,
                      })),
                  }
                : {}),
            ...(projected === undefined ? {} : { payloadJson: canonicalizeIJson(projected) }),
            ...(parent.length ? { causation: [...parent] } : {}),
        };
        // Reserve enough room for one bounded subscription and its durable envelope.
        if (Buffer.byteLength(JSON.stringify(content)) + 65536 > DURABLE_EVENT_RECORD_LIMIT) {
            throw new EventsError("CAPACITY_EXCEEDED");
        }
        const snapshot = await this.services.store.subscriptionSnapshot();
        const intent: EventPublication = {
            id,
            siteId: owner.siteId,
            definitionId,
            occurrenceId,
            fingerprint,
            acceptedAt: content.occurredAt,
            receiptExpiresAt:
                this.services.now() + (this.services.policy.receiptRetentionMs ?? this.services.policy.retentionMs),
            pending: true,
            fanout: {
                snapshot,
                routingKeys: eventRoutingKeys(definition, input),
                event: content,
                expiresAt: this.services.now() + this.services.policy.retentionMs,
            },
        };
        const batch = await preparePublicationBatch(this.services, intent);
        const { fanout, ...metadata } = intent;
        const prepared: EventPublication =
            batch.record || batch.nextCursor
                ? { ...intent, fanout: { ...fanout!, batch } }
                : { ...metadata, pending: false };
        const record = await this.services.store.putPublication(prepared);
        await handoffEventPublication(this.services, record);
        return { occurrenceId: record.occurrenceId, accepted: true };
    }
    async recover(limit: number) {
        const pending = await this.services.store.pendingPublications(limit);
        for (const publication of pending) {
            await handoffEventPublication(this.services, publication);
        }
        return pending.length;
    }
}
