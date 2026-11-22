import { providerCredentialFingerprint } from "@bernouy/cms-gateway/access/providers";
import { FormsService, SubmissionService, NotificationWorker, FormsError } from "@bernouy/forms";
import type { FormsServices, FormsDelivery } from "@bernouy/forms";
import { formsRepository } from "./repository";
import { ProviderClientError } from "@bernouy/cms-gateway/provider";
import type { ProviderConnections } from "@bernouy/cms-gateway/provider/node";
import type { createProviderGateway } from "../../gateway/createProviderGateway";
import type { ProviderStores } from "../../stores/providerStores";

/** Only Forms selects the current Emailer; transport/configuration stay in their existing owners. */
export async function composeForms(options: {
    instanceId: string;
    providerId: string;
    stores: ProviderStores;
    gateway: Awaited<ReturnType<typeof createProviderGateway>>;
    connections: ProviderConnections;
}) {
    const { stores, gateway, connections, instanceId } = options;
    const storage = formsRepository(stores.db);
    const store = storage.repository;
    const selected = async () => {
        const route = await gateway.routes.resolve("default", "ulvia/cms.forms");
        if (
            !route ||
            route.installation.installation.accountId !== instanceId ||
            route.installation.installation.providerId !== options.providerId ||
            !(await gateway.routes.isCurrent(route))
        ) {
            return undefined;
        }
        const connection = await connections.get(route.selection.installationId);
        const mail = await gateway.routes.resolve("default", "ulvia/cms.emailer");
        if (!connection || !mail || !(await gateway.routes.isCurrent(mail))) {
            return undefined;
        }
        try {
            await gateway.invoker.assertAuthorized({
                siteId: "default",
                contractId: "ulvia/cms.emailer",
                capabilityId: "emailer.send",
                actor: {
                    kind: "provider",
                    installationId: route.selection.installationId,
                    credentialFingerprint: providerCredentialFingerprint(connection.token),
                },
            });
            return { connection, release: mail.requestedRelease.admission.release };
        } catch {
            return undefined;
        }
    };
    const delivery: FormsDelivery = {
        available: async () => Boolean(await selected()),
        async send(input, key) {
            const target = await selected();
            if (!target) {
                return "blocked";
            }
            try {
                const result = await connections
                    .client(target.connection.connectionId, true)
                    .invoke(target.release, "emailer.send", input, { authority: "provider", idempotencyKey: key });
                return result.output &&
                    typeof result.output === "object" &&
                    "sent" in result.output &&
                    result.output.sent === true
                    ? "accepted"
                    : "unknown";
            } catch (error) {
                return error instanceof ProviderClientError && error.code === "EMAIL_DISABLED"
                    ? "blocked"
                    : error instanceof ProviderClientError && error.code === "INVALID_INPUT"
                      ? "failed"
                      : "unknown";
            }
        },
    };
    const forms = new FormsService(store, delivery.available);
    const services: FormsServices = {
        forms,
        submissions: new SubmissionService(store, forms),
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
    const worker = new NotificationWorker(instanceId, store, delivery);
    return { services, tick: async () => ((await storage.hasWork()) ? worker.tick() : 0), stop: () => worker.stop() };
}
