import type { ProviderManagement } from "@bernouy/cms-repository/providers/management";
import type { UlviaProviderManagement } from "@bernouy/ulvia-provider";
import { resolveOfficialInstanceProfile, type ProviderInstanceRecord } from "@bernouy/ulvia-provider";

export function createProtectedProviderManagement(
    management: ProviderManagement,
    instance: ProviderInstanceRecord,
): UlviaProviderManagement {
    const profile = resolveOfficialInstanceProfile(instance.profile.id, instance.profile.version);
    if (!profile) {
        throw new Error(`Unsupported Provider instance profile: ${instance.profile.id}@${instance.profile.version}`);
    }
    return {
        replaceSelections: async (input) => {
            const state = await management.list();
            const system = state.installations.find(
                (candidate) =>
                    candidate.providerId === profile.manifest.providerId && candidate.accountId === instance.id,
            );
            if (!system) {
                throw policyError("system_installation_missing");
            }
            for (const contract of profile.contracts) {
                const selection = input.selections.find((candidate) => candidate.contractId === contract.contractId);
                if (
                    !selection ||
                    selection.installationId !== system.id ||
                    selection.version !== contract.version ||
                    selection.digest !== contract.digest
                ) {
                    throw policyError("system_selection_protected");
                }
            }
            return management.replaceSelections(input);
        },
        setStatus: (input) => management.setStatus(input),
    };
}

function policyError(code: string): Error & { code: string } {
    return Object.assign(new Error(code), { code });
}
