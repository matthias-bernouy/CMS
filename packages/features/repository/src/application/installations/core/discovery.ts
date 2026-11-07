import type { InstallationGateway } from "repository/application/installations/interfaces/gateway";
import { required } from "repository/application/installations/core/gateway/requirements";
import { InstallationError } from "repository/application/installations/core/errors";
export async function describeCapabilities(gateway: InstallationGateway | undefined, contractId: string) {
    const selected = await required(gateway?.describeContract)(contractId);
    const release = selected?.admission.release;
    if (!release) {
        return { found: false, version: "", capabilities: [] };
    }
    if (release.capabilities.length > 256) {
        throw new InstallationError("CORE_UNAVAILABLE");
    }
    return {
        found: true,
        version: release.version,
        capabilities: release.capabilities.map((capability) => ({
            id: capability.id,
            access: capability.access,
            effect: capability.behavior.effect,
            sensitive: capability.behavior.sensitive,
            ...(capability.docs ? { docs: capability.docs } : {}),
        })),
    };
}
