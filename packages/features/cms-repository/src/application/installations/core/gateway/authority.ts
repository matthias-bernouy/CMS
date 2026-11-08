import { delegationActor } from "cms-repository/application/installations/core/gateway/actors";
import type { InstallationGateway } from "cms-repository/application/installations/interfaces/gateway";
import type {
    GatewayProviderAuthorizeInput,
    GatewayDelegationIssueInput,
    GatewayDelegationCheckInput,
    GatewayDelegationCloseInput,
} from "cms-repository/application/installations/interfaces/inputs";
import { InstallationError } from "cms-repository/application/installations/core/errors";
function providers(gateway: InstallationGateway | undefined) {
    if (!gateway?.providers) {
        throw new InstallationError("FORBIDDEN");
    }
    return gateway.providers;
}
function delegations(gateway: InstallationGateway | undefined) {
    if (!gateway?.delegations) {
        throw new InstallationError("FORBIDDEN");
    }
    return gateway.delegations;
}
export async function resolveProvider(gateway: InstallationGateway | undefined, token: string) {
    return { installationId: await providers(gateway).authenticate(token) };
}
export async function authorizeProvider(
    gateway: InstallationGateway | undefined,
    input: GatewayProviderAuthorizeInput,
) {
    return { allowed: await providers(gateway).authorize(input) };
}
export async function issueDelegation(
    gateway: InstallationGateway | undefined,
    source: GatewayDelegationIssueInput["source"],
) {
    return { delegation: await delegations(gateway).issue({ ...source, actor: delegationActor(source.actor) }) };
}
export function checkDelegation(
    gateway: InstallationGateway | undefined,
    target: GatewayDelegationCheckInput["target"],
) {
    return delegations(gateway).check(target);
}
export async function closeDelegation(
    gateway: InstallationGateway | undefined,
    context: GatewayDelegationCloseInput["context"],
) {
    await delegations(gateway).close(context);
    return { accepted: true };
}
