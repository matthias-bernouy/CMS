import { ProviderCommandPreparationFailure } from "@bernouy/cms-gateway/protocol";
import type { ProviderCommandPreparation, PreparedProviderDispatch } from "@bernouy/cms-gateway/protocol";
import type { ProviderIdentityService } from "@bernouy/cms-gateway/identity";
import type { GatewayCommandAuditStore } from "@bernouy/cms-gateway/audit";

/** Identity failure precedes the audit; no business dispatch can occur before durable append. */
export function createCommandPreparer(
    identities: ProviderIdentityService,
    audit: GatewayCommandAuditStore,
    prepare: (input: ProviderCommandPreparation) => Promise<PreparedProviderDispatch>,
) {
    return async (input: ProviderCommandPreparation) => {
        const { commandStart, actor } = input;
        let expectedSubjectId: string | undefined;
        try {
            if (commandStart.identityRequired && (actor.kind === "user" || actor.kind === "administrator")) {
                expectedSubjectId = await identities.getOrCreate(
                    { providerId: commandStart.providerId },
                    actor.subjectId,
                );
            }
        } catch (error) {
            throw new ProviderCommandPreparationFailure("identity", error);
        }
        try {
            await audit.append(commandStart.event);
        } catch (error) {
            if (!error || typeof error !== "object" || !("code" in error) || Number(error.code) !== 11000) {
                throw new ProviderCommandPreparationFailure("audit", error);
            }
        }
        try {
            return await prepare({ ...input, ...(expectedSubjectId ? { expectedSubjectId } : {}) });
        } catch (error) {
            throw new ProviderCommandPreparationFailure("preparation", error);
        }
    };
}
