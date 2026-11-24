import { gatewayContext } from "../gateway/context";
import { readProviderCredential } from "../../../integration/instance/providers/credentials";
import { providerCredentialFingerprint } from "@bernouy/cms-gateway/access/providers";
import { assertCondition, requireRecord } from "../queries/types";
import type { FreshTenant } from "../installations/fresh";
import type { CapabilityInventory } from "../../capabilities/types";
import type { QueryEnvironment } from "../queries/execute";
export const WORKFLOWS = "ulvia/cms.workflows";
export const INSTALLATIONS = "ulvia/cms.installations";
export async function workflowContext(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    fresh: FreshTenant,
) {
    const call = (capability: string, input: Readonly<Record<string, unknown>> = {}) =>
        fresh.fixture(capability, input, WORKFLOWS);
    const hostname = new URL(fresh.site.url).hostname;
    assertCondition(/^perf-flow-[a-z0-9]{24}\.localhost$/u.test(hostname));
    const credentialKey = `${environment.stack.id}-${hostname.slice(0, -".localhost".length)}`;
    let control: Awaited<ReturnType<typeof gatewayContext>> | undefined;
    const gateway = async () => {
        if (!control) {
            const credential = await readProviderCredential(
                environment.stack.providerName,
                credentialKey,
                undefined,
                fresh.site.instanceId,
            );
            assertCondition(credential.controlToken && environment.stack.providerControl);
            control = await gatewayContext(inventory, {
                ...environment,
                main: fresh.session,
                stack: {
                    ...environment.stack,
                    instanceId: fresh.site.instanceId,
                    providerControl: {
                        origin: environment.stack.providerControl.origin,
                        token: credential.controlToken,
                    },
                },
            });
        }
        return control;
    };
    const machine = async (capabilityId: string, contractId = INSTALLATIONS) => {
        const context = await gateway();
        const { selections } = await context.readers.provider();
        const selected = selections.find((row) => row.contractId === contractId);
        const target = inventory.targets.find(
            (row) => !row.retained && row.release.contractId === contractId && row.definition.id === capabilityId,
        );
        assertCondition(selected && target);
        const requestId = crypto.randomUUID();
        const source =
            contractId !== WORKFLOWS
                ? await readProviderCredential(
                      environment.stack.providerName,
                      credentialKey,
                      String(selected.installationId),
                      fresh.site.instanceId,
                  )
                : undefined;
        const issued = requireRecord(
            await context.checked("gateway.invocation.issue", {
                requestId,
                installationId: selected.installationId,
                contractId,
                contractVersion: target.release.version,
                capabilityId,
                ...(source
                    ? {
                          sourceInstallationId: selected.installationId,
                          sourceCredentialFingerprint: providerCredentialFingerprint(source.token),
                      }
                    : { systemServiceId: "cms-events-delivery" }),
            }),
        );
        assertCondition(typeof issued.token === "string");
        return (input: Readonly<Record<string, unknown>>, verify?: (output: unknown) => void) =>
            context.call(capabilityId, input, verify, String(issued.token), contractId, requestId);
    };
    return { fresh, call, gateway, machine, inventory, environment };
}
export type WorkflowContext = Awaited<ReturnType<typeof workflowContext>>;
