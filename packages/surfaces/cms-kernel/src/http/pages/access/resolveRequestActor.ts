import type { GatewayActor } from "@bernouy/cms-gateway";
import type KernelCms from "cms-kernel/KernelCms";

export async function resolveRequestActor(kernel: KernelCms, request: Request): Promise<GatewayActor> {
    const subject = await kernel.authentication.getSubject(request).catch(() => null);
    if (!subject) {
        return { kind: "anonymous" };
    }
    const administrator = await kernel.capabilityGateway?.isAdministrator(subject).catch(() => false);
    return {
        kind: administrator ? "administrator" : "user",
        subjectId: subject.identifier,
    };
}
