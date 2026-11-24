import { formsEventServices } from "./events";
import { SubmissionEventWorker } from "@bernouy/forms";
import type { EventServices } from "@bernouy/cms-events";
import { withSiteWriteFence } from "@bernouy/repository/upgrades";
import { FormsService, SubmissionService, FormsError } from "@bernouy/forms";
import type { FormsServices } from "@bernouy/forms";
import { formsRepository } from "./repository";
import type { ProviderConnections } from "@bernouy/cms-gateway/provider/node";
import type { createProviderGateway } from "../../gateway/createProviderGateway";
import type { ProviderStores } from "../../stores/providerStores";

/** Forms retains answers and emits business Events; workflows own downstream effects. */
export async function composeForms(options: {
    events?: EventServices;
    instanceId: string;
    providerId: string;
    stores: ProviderStores;
    gateway: Awaited<ReturnType<typeof createProviderGateway>>;
    connections: ProviderConnections;
}) {
    const { stores, instanceId } = options;
    const storage = formsRepository(stores.db);
    const store = storage.repository;
    const eventSupport = options.events ? formsEventServices(options, options.events, store) : undefined;
    const forms = withSiteWriteFence(new FormsService(store, Date.now), stores.upgradeStorage, "default", [
        "create",
        "update",
        "publish",
        "availability",
        "archive",
    ]);
    const eventWorker = new SubmissionEventWorker(store, eventSupport?.publication);
    const services: FormsServices = {
        forms,
        captureInitiator: eventSupport?.captureInitiator,
        submissions: new SubmissionService(store, forms, Date.now, eventSupport?.publication),
        principal(context) {
            if (!context.connectionId) {
                throw new FormsError("CORE_UNAVAILABLE");
            }
            if (
                (!context.actorKind || context.actorKind === "anonymous") &&
                !context.subjectId &&
                !context.sourceInstallationId &&
                !context.systemServiceId
            ) {
                return JSON.stringify([instanceId, context.connectionId, "anonymous"]);
            }
            if (
                context.subjectId &&
                !context.sourceInstallationId &&
                !context.systemServiceId &&
                [undefined, "user", "administrator"].includes(context.actorKind)
            ) {
                return JSON.stringify([instanceId, context.connectionId, "subject", context.subjectId]);
            }
            if (context.sourceInstallationId && !context.systemServiceId) {
                return JSON.stringify([
                    instanceId,
                    context.connectionId,
                    "delegation",
                    context.sourceInstallationId,
                    context.subjectId ?? context.actorKind ?? "anonymous",
                ]);
            }
            throw new FormsError("SUBMISSION_NOT_ALLOWED");
        },
    };
    return {
        services,
        async tick() {
            if (!(await storage.hasWork())) {
                return 0;
            }
            return (await eventWorker?.tick()) ?? 0;
        },
        async stop() {
            await eventWorker?.stop();
        },
    };
}
