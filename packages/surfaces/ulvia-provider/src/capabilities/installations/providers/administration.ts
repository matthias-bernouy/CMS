import type { ProviderCapabilityRegistry, ProviderCapabilityInvocationContext } from "../../../dispatch/registry";
import { ProviderCapabilityDispatchError } from "../../../dispatch/registry";
import type { UlviaProviderManagement } from "../../../ports";
import { collectionCommand, requiredText } from "../support";

export function registerProviderAdministration(
    dispatcher: ProviderCapabilityRegistry,
    management?: UlviaProviderManagement,
) {
    const service = () => {
        if (!management?.administration) {
            throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
        }
        return management.administration;
    };
    const actor = (context: ProviderCapabilityInvocationContext) => {
        if (!context.subjectId || (context.sourceInstallationId && !context.rootRequestId) || context.systemServiceId) {
            throw new ProviderCapabilityDispatchError("FORBIDDEN", 403);
        }
        return context.subjectId;
    };
    dispatcher.register("ulvia.cms.installations", "list-available-providers", async (_input, context) => {
        actor(context);
        const entries = await service().catalogue();
        return {
            items: entries.map(({ repositoryId, publisherId, id, version, digest, name }) => ({
                repositoryId,
                publisherId,
                id,
                version,
                digest,
                name,
            })),
        };
    });
    dispatcher.register("ulvia.cms.installations", "import-provider-manifest", (input, context) =>
        administrationCommand(async () => {
            actor(context);
            const value = (await service().importReference(input as never)) as {
                id: string;
                version: string;
                digest: string;
            };
            return { id: value.id, version: value.version, digest: value.digest };
        }),
    );
    dispatcher.register("ulvia.cms.installations", "preview-provider-connection", (input, context) =>
        administrationCommand(() => service().preview(input as never, actor(context))),
    );
    dispatcher.register("ulvia.cms.installations", "approve-provider-connection", (input, context) =>
        administrationCommand(() => service().approve(requiredText(input.ticket), actor(context))),
    );
    dispatcher.register("ulvia.cms.installations", "get-provider-access", (input, context) =>
        administrationCommand(() => {
            actor(context);
            return service().access(requiredText(input.installationId));
        }),
    );
    dispatcher.register("ulvia.cms.installations", "pair-provider-connection", (input, context) =>
        administrationCommand(() =>
            service().pair(
                {
                    installationId: String(input.installationId),
                    expectedRevision: Number(input.expectedRevision),
                    rotate: input.rotate === true,
                },
                actor(context),
            ),
        ),
    );
}

async function administrationCommand<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await collectionCommand(operation);
    } catch (error) {
        if (error && typeof error === "object" && "status" in error && error.status === 403) {
            throw new ProviderCapabilityDispatchError("FORBIDDEN", 403);
        }
        throw error;
    }
}
