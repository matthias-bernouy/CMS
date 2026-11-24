import { createHmac } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { EventsError } from "@bernouy/cms-events";
import type { EventInitiators, EventDefinition } from "@bernouy/cms-events";
import type { ProviderCapabilityInvocationContext } from "@bernouy/cms-gateway/provider/server";
import type { eventsAuthority } from "../authority";
import type { InitiatorActor } from "./claims";
import { originCodec } from "./claims";
import { originParent } from "./parent";
type Options = Parameters<typeof eventsAuthority>[0];
export function eventInitiators(options: Options): EventInitiators {
    const { gateway, stores, instanceId, providerId } = options;
    const codec = originCodec(stores.fieldCrypto, instanceId, gateway.siteId);
    const identityDigest = (actor: InitiatorActor) =>
        createHmac("sha256", stores.runtimeSessionSecret)
            .update("ulvia-event-initiator-identity/v1\0")
            .update(canonicalizeIJson(actor))
            .digest("hex");
    const contextScope = (context: ProviderCapabilityInvocationContext) => {
        if (
            context.siteId !== gateway.siteId ||
            context.providerId !== providerId ||
            context.invocation?.instanceId !== instanceId ||
            !context.connectionId ||
            context.controlAuthority
        ) {
            throw new EventsError("FORBIDDEN");
        }
    };
    const captureActor = async (
        context: ProviderCapabilityInvocationContext,
        definition: EventDefinition,
    ): Promise<InitiatorActor> => {
        contextScope(context);
        const local =
            context.invocation!.contractId === definition.owner.namespace &&
            context.connectionId === definition.owner.installationId;
        const remote =
            context.invocation!.contractId === "ulvia/cms.events" &&
            context.sourceInstallationId === definition.owner.installationId &&
            !context.systemServiceId;
        if (!local && !remote) {
            throw new EventsError("FORBIDDEN");
        }
        if (context.subjectId) {
            if ((context.sourceInstallationId && !context.rootRequestId) || context.systemServiceId) {
                throw new EventsError("FORBIDDEN");
            }
            const subjectId = await gateway.identities.resolve({ providerId }, context.subjectId);
            if (!subjectId) {
                throw new EventsError("FORBIDDEN");
            }
            return { kind: "user", subjectId };
        }
        if (context.systemServiceId) {
            return { kind: "system", authority: providerId, serviceId: context.systemServiceId };
        }
        if (!context.sourceInstallationId || context.rootRequestId) {
            return { kind: "anonymous" };
        }
        const source = await gateway.routes.resolve(gateway.siteId, definition.owner.namespace);
        if (
            !source ||
            source.selection.installationId !== context.sourceInstallationId ||
            !(await gateway.routes.isCurrent(source))
        ) {
            throw new EventsError("FORBIDDEN");
        }
        return { kind: "system", authority: source.installation.installation.providerId };
    };
    const seal = (definition: EventDefinition, occurrenceId: string, actor: InitiatorActor) => {
        if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(occurrenceId)) {
            throw new EventsError("INVALID_INPUT");
        }
        return codec.seal({
            format: "ulvia-event-initiator/v1",
            instanceId,
            owner: definition.owner,
            definitionId: definition.id,
            eventType: definition.eventType,
            occurrenceId,
            actor,
        });
    };
    const api: EventInitiators = {
        async capture(context, definition, occurrenceId) {
            await options.services().authority.assertSource(definition);
            return seal(definition, occurrenceId, await captureActor(context, definition));
        },
        async verify(owner, definition, occurrenceId, proof) {
            const claims = await codec.open(proof);
            if (
                canonicalizeIJson(claims.owner) !== canonicalizeIJson(owner) ||
                claims.definitionId !== definition.id ||
                claims.eventType !== definition.eventType ||
                claims.occurrenceId !== occurrenceId
            ) {
                throw new EventsError("FORBIDDEN");
            }
            return {
                initiator: { kind: claims.actor.kind, reference: proof },
                fingerprint: identityDigest(claims.actor),
            };
        },
        async publication(context, definition, occurrenceId, input) {
            contextScope(context);
            if (input.initiatorProof && input.causeDeliveryId) {
                throw new EventsError("INVALID_INPUT");
            }
            if (input.causeDeliveryId) {
                if (
                    context.sourceInstallationId !== definition.owner.installationId ||
                    context.subjectId ||
                    context.systemServiceId ||
                    context.rootRequestId
                ) {
                    throw new EventsError("FORBIDDEN");
                }
                const parent = await originParent(
                    stores.db,
                    gateway.siteId,
                    context.sourceInstallationId,
                    input.causeDeliveryId,
                );
                const original = parent.initiator ? await codec.open(parent.initiator.reference) : undefined;
                if (original && original.actor.kind !== parent.initiator!.kind) {
                    throw new EventsError("FORBIDDEN");
                }
                return {
                    causation: parent.causation,
                    ...(original ? { proof: await seal(definition, occurrenceId, original.actor) } : {}),
                };
            }
            const causation = await options.services().authority.ancestry(context);
            if (input.initiatorProof) {
                return { causation, proof: input.initiatorProof };
            }
            // A plain background publisher cannot establish the original actor merely by publishing.
            return {
                causation,
                ...(context.subjectId || context.rootRequestId
                    ? { proof: await api.capture(context, definition, occurrenceId) }
                    : {}),
            };
        },
        async resolve(context, reference, targetContractId) {
            contextScope(context);
            const claims = await codec.open(reference);
            if (claims.actor.kind !== "user") {
                throw new EventsError("NOT_FOUND");
            }
            const target = await gateway.routes.resolve(gateway.siteId, targetContractId);
            if (!target || !(await gateway.routes.isCurrent(target))) {
                throw new EventsError("FORBIDDEN");
            }
            if (context.sourceInstallationId) {
                if (
                    context.subjectId ||
                    context.rootRequestId ||
                    context.systemServiceId ||
                    target.selection.installationId !== context.sourceInstallationId
                ) {
                    throw new EventsError("FORBIDDEN");
                }
            } else {
                await options.administrator(context);
            }
            const authority = target.installation.installation.providerId;
            return {
                authority,
                subjectId: await gateway.identities.getOrCreate({ providerId: authority }, claims.actor.subjectId),
            };
        },
    };
    return api;
}
