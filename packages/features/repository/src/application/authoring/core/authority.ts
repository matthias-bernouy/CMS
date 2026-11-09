import type { ProviderCapabilityInvocationContext } from "@bernouy/cms-gateway/provider/server";
import type { AuthoringServices } from "../interfaces/AuthoringServices";
export class AuthoringAuthorityError extends Error {}

/** The SDK repeats this guard in recovered workers, before any remote publication. */
export async function authorizePublication({
    services,
    context,
}: {
    services: AuthoringServices;
    context: ProviderCapabilityInvocationContext;
}) {
    if (!services.authoringAuthority) {
        throw new Error("Authoring administrator authority is unavailable");
    }
    if (
        !context.subjectId ||
        context.systemServiceId ||
        context.sourceInstallationId ||
        context.controlAuthority ||
        !(await services.authoringAuthority.administrator({
            providerId: context.providerId,
            subjectId: context.subjectId,
        }))
    ) {
        throw new AuthoringAuthorityError("Current administrator authority is required");
    }
}
