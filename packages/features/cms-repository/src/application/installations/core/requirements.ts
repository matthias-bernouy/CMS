import { InstallationError } from "cms-repository/application/installations/core/errors";
import type { InstallationGateway } from "cms-repository/application/installations/interfaces/gateway";
import type { InstallationManagement } from "cms-repository/application/installations/interfaces/management";
import type { ProviderCapabilityContext } from "@bernouy/ulvia-sdk";
import type { CapabilitySource } from "@bernouy/ulvia-sdk";
type Actor = Pick<
    ProviderCapabilityContext<CapabilitySource>,
    "subjectId" | "sourceInstallationId" | "rootRequestId" | "systemServiceId" | "controlAuthority"
>;
export function required<T>(value: T | undefined): T {
    if (!value) {
        throw new InstallationError("CORE_UNAVAILABLE");
    }
    return value;
}
export function requiredGateway(value: InstallationGateway | undefined): InstallationGateway {
    return required(value);
}
export function requiredManagement(value: InstallationManagement | undefined): InstallationManagement {
    return required(value);
}
export function actor(context: Actor): string {
    if (!context.subjectId || (context.sourceInstallationId && !context.rootRequestId) || context.systemServiceId) {
        throw new InstallationError("FORBIDDEN");
    }
    return context.subjectId;
}
export function control(context: Actor): void {
    if (!context.controlAuthority) {
        throw new InstallationError("FORBIDDEN");
    }
}
