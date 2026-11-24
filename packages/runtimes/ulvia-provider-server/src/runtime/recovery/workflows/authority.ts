import { WorkflowError } from "@bernouy/workflows";
import type { WorkflowAuthority } from "@bernouy/workflows";
import type { createProviderGateway } from "../../gateway/createProviderGateway";
export function workflowAuthority(
    gateway: Awaited<ReturnType<typeof createProviderGateway>>,
    instanceId: string,
    providerId: string,
): WorkflowAuthority {
    const assertAdministrator = async (subjectId: string) => {
        try {
            const result = await gateway.invoker.invoke({
                siteId: gateway.siteId,
                contractId: "ulvia/cms.access",
                capabilityId: "inspect-actor",
                input: { subjectId },
                actor: { kind: "system", serviceId: "cms-gateway" },
            });
            if (
                result.kind !== "success" ||
                !result.output ||
                typeof result.output !== "object" ||
                !("state" in result.output)
            ) {
                throw new WorkflowError("CORE_UNAVAILABLE");
            }
            const current = result.output;
            if (
                current.state === "anonymous" ||
                (current.state === "authenticated" && "administrator" in current && current.administrator === false)
            ) {
                throw new WorkflowError("FORBIDDEN");
            }
            if (
                current.state !== "authenticated" ||
                !("subjectId" in current) ||
                current.subjectId !== subjectId ||
                !("administrator" in current) ||
                current.administrator !== true
            ) {
                throw new WorkflowError("CORE_UNAVAILABLE");
            }
        } catch (error) {
            if (error instanceof WorkflowError) {
                throw error;
            }
            throw new WorkflowError("CORE_UNAVAILABLE");
        }
    };
    return {
        assertAdministrator,
        async callAncestry(context) {
            if (
                !context.connectionId ||
                context.invocation?.instanceId !== instanceId ||
                context.invocation.contractId !== "ulvia/cms.workflows"
            ) {
                throw new WorkflowError("FORBIDDEN");
            }
            return context.eventCausation ?? [];
        },
        async administrator(context) {
            if (
                context.siteId !== gateway.siteId ||
                context.providerId !== providerId ||
                context.invocation?.instanceId !== instanceId ||
                !context.subjectId ||
                context.sourceInstallationId ||
                context.systemServiceId ||
                context.controlAuthority ||
                context.rootRequestId
            ) {
                throw new WorkflowError("FORBIDDEN");
            }
            const subjectId = await gateway.identities.resolve({ providerId }, context.subjectId);
            if (!subjectId) {
                throw new WorkflowError("FORBIDDEN");
            }
            await assertAdministrator(subjectId);
            return subjectId;
        },
        async assertEventDelivery(context, event) {
            if (
                context.siteId !== gateway.siteId ||
                context.providerId !== providerId ||
                context.invocation?.instanceId !== instanceId ||
                context.invocation.contractId !== "ulvia/cms.workflows" ||
                context.systemServiceId !== "cms-events-delivery" ||
                context.sourceInstallationId ||
                context.subjectId ||
                context.rootRequestId ||
                context.controlAuthority ||
                event.consumerContractId !== "ulvia/cms.workflows"
            ) {
                throw new WorkflowError("FORBIDDEN");
            }
        },
    };
}
