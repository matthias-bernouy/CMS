import type { ProviderCapabilityInvocationContext } from "@bernouy/cms-gateway/provider/server";
import type { EventReadScope } from "@bernouy/cms-events";

/** Administrator filters narrow to one selected source; Provider readers always retain installation ownership. */
export function eventSourceReader(options: {
    siteId: string;
    provider(context: ProviderCapabilityInvocationContext): string;
    administrator(context: ProviderCapabilityInvocationContext): Promise<string>;
    installation(namespace: string, ownerInstallationId?: string): Promise<string>;
}) {
    return async (context: ProviderCapabilityInvocationContext, namespace?: string): Promise<EventReadScope | null> => {
        if (context.subjectId && !context.sourceInstallationId && !context.systemServiceId) {
            await options.administrator(context);
            if (!namespace) {
                return null;
            }
            return { siteId: options.siteId, installationId: await options.installation(namespace), namespace };
        }
        const installationId = options.provider(context);
        if (namespace) {
            await options.installation(namespace, installationId);
        }
        return { siteId: options.siteId, installationId, ...(namespace ? { namespace } : {}) };
    };
}
