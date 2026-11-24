import type { ProviderCapabilityInvocationContext } from "@bernouy/cms-gateway/provider/server";
import { EventDefinitions, EventPublications } from "@bernouy/cms-events";
import type { EventServices } from "@bernouy/cms-events";
import type { FormsSubmissionEvents, FormsRepository } from "@bernouy/forms";
import { FormsError, submissionValues } from "@bernouy/forms";
import type { composeForms } from "./composition";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";

type Options = Parameters<typeof composeForms>[0];
export function formsEventServices(options: Options, events: EventServices, forms: FormsRepository) {
    const owner = async () => {
        const route = await options.gateway.routes.resolve("default", "ulvia/cms.forms");
        if (
            !route ||
            route.installation.installation.accountId !== options.instanceId ||
            route.installation.installation.providerId !== options.providerId ||
            !(await options.gateway.routes.isCurrent(route))
        ) {
            throw new FormsError("CORE_UNAVAILABLE");
        }
        return {
            route,
            owner: { siteId: "default", installationId: route.selection.installationId, namespace: "ulvia/cms.forms" },
        };
    };
    const publication: FormsSubmissionEvents = {
        async prepare(causation, initiatorProof) {
            const selected = await owner();
            // An explicitly retained baseline implementation does not acquire new dependencies or events.
            if (
                !selected.route.requestedRelease.admission.release.events?.some(({ id }) => id === "submission.created")
            ) {
                return null;
            }
            const definition = await new EventDefinitions(events).resolve(selected.owner, "submission.created");
            return {
                initiatorProof: initiatorProof ?? null,
                installationId: selected.owner.installationId,
                definitionId: definition.id,
                causation: [...causation],
                state: "pending",
                attempts: 0,
                token: null,
                dueAt: new Date().toISOString(),
            };
        },
        async publish(record) {
            if (!record.event || !forms) {
                throw new FormsError("CORE_UNAVAILABLE");
            }
            const selected = await owner();
            if (selected.owner.installationId !== record.event.installationId) {
                throw new FormsError("CORE_UNAVAILABLE");
            }
            const version = await forms.version(record.formId, record.formVersion);
            const payloadJson = canonicalizeIJson({
                formId: record.formId,
                formVersion: record.formVersion,
                submissionId: record.receiptId,
                receivedAt: record.receivedAt,
                answers: submissionValues(version.draft.fields, record.answers),
            });
            const definition = await new EventDefinitions(events).resolve(selected.owner, "submission.created");
            await new EventPublications(events).publish(
                selected.owner,
                definition.id,
                record.receiptId,
                payloadJson,
                record.event.causation,
                record.event.initiatorProof ?? undefined,
            );
        },
    };
    return {
        publication,
        async captureInitiator(context: ProviderCapabilityInvocationContext, occurrenceId: string) {
            const selected = await owner();
            if (
                !selected.route.requestedRelease.admission.release.events?.some(({ id }) => id === "submission.created")
            ) {
                return undefined;
            }
            if (!events.initiators) {
                throw new FormsError("CORE_UNAVAILABLE");
            }
            const definition = await new EventDefinitions(events).resolve(selected.owner, "submission.created");
            return events.initiators.capture(context, definition, occurrenceId);
        },
    };
}
