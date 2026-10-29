import { providerCredentialFingerprint } from "@bernouy/cms-gateway/access/providers";
import type { ProviderAccess } from "@bernouy/cms-gateway/access/providers";
import type { ProviderMachinePreparation, PreparedProviderMachine } from "@bernouy/cms-gateway/protocol";
import type { createDispatchPreparer } from "./prepareDispatch";

/** Authentication supplies provenance. Every preparation/signing fence still runs. */
export function createMachinePreparer(
    providers: Pick<ProviderAccess, "authenticate">,
    prepare: ReturnType<typeof createDispatchPreparer>,
) {
    return async (input: ProviderMachinePreparation): Promise<PreparedProviderMachine> => {
        const sourceInstallationId = await providers.authenticate(input.token);
        if (!sourceInstallationId) {
            throw Object.assign(new Error("Provider credential is unavailable"), { status: 403 });
        }
        const result = await prepare({
            ...(input.closedDelegations ? { closedDelegations: input.closedDelegations } : {}),
            invocation: {
                ...input.invocation,
                sourceInstallationId,
                sourceCredentialFingerprint: providerCredentialFingerprint(input.token),
            },
            actor: {
                kind: "provider",
                installationId: sourceInstallationId,
                credentialFingerprint: providerCredentialFingerprint(input.token),
            },
            deadline: input.deadline,
        });
        return { ...result, sourceInstallationId };
    };
}
