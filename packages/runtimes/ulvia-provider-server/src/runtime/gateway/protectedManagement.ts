import type { ProviderManagement } from "@bernouy/cms-repository/providers/management";
import type { OfficialInstanceProfile, ProviderInstanceRecord, UlviaProviderManagement } from "@bernouy/ulvia-provider";

const CONTROL_CONTRACT_ID = "ulvia.cms.installations";

export function createProtectedProviderManagement(
    management: ProviderManagement,
    instance: ProviderInstanceRecord,
    profile: OfficialInstanceProfile,
): UlviaProviderManagement {
    const controlInstallation = async () => {
        const state = await management.list();
        const installation = state.installations.find(
            (candidate) => candidate.providerId === profile.manifest.providerId && candidate.accountId === instance.id,
        );
        if (!installation) {
            throw policyError("control_installation_missing");
        }
        return installation;
    };
    return {
        replaceSelections: async (input) => {
            const control = await controlInstallation();
            const contract = profile.contracts.find((candidate) => candidate.contractId === CONTROL_CONTRACT_ID);
            if (!contract) {
                throw policyError("control_contract_missing");
            }
            const selection = input.selections.find((candidate) => candidate.contractId === CONTROL_CONTRACT_ID);
            if (
                !selection ||
                selection.installationId !== control.id ||
                selection.version !== contract.version ||
                selection.digest !== contract.digest
            ) {
                throw policyError("control_selection_protected");
            }
            if (!input.selections.some(({ contractId }) => contractId === "ulvia.cms.observability")) {
                throw policyError("observability_selection_protected");
            }
            return management.replaceSelections(input);
        },
        setStatus: async (input) => {
            const control = await controlInstallation();
            if (input.installationId === control.id) {
                throw policyError("control_installation_protected");
            }
            return management.setStatus(input);
        },
    };
}

function policyError(code: string): Error & { code: string } {
    return Object.assign(new Error(code), { code });
}
