import { withManagementLease } from "./lease";
import type { IntegrationManagementActor } from "../../../interfaces/Integration/management";
import { IntegrationInputError, IntegrationRuntimeError, MissingIntegrationInstallationError } from "../../errors";
import type { IntegrationInstallation } from "../../../interfaces/IntegrationInstallation";
import type { IntegrationManagementDeps } from "./contracts";
import { IntegrationHealthObserver } from "./health";
import { invokeManagement } from "./invoke";

export class IntegrationManagementService {
    private readonly observer: IntegrationHealthObserver;
    private readonly writes = new Set<string>();
    constructor(private readonly deps: IntegrationManagementDeps) {
        this.observer = new IntegrationHealthObserver(deps);
    }
    async health(id: string, refresh = false, actor?: IntegrationManagementActor) {
        return this.observer.read(await this.installation(id), refresh, actor);
    }
    async action(
        id: string,
        actionId: string,
        input: Record<string, unknown> = {},
        actor?: IntegrationManagementActor,
    ): Promise<unknown> {
        return this.mutate(id, async (installation) => {
            const management = installation.definitionSnapshot?.management;
            const action = management?.actions?.find(({ id }) => id === actionId);
            if (!action) {
                throw new IntegrationInputError("actionId", "must reference a declared management action");
            }
            return invokeManagement(this.deps, installation, action.functionId, "action", input, actor, actionId);
        });
    }
    private async installation(id: string): Promise<IntegrationInstallation> {
        const installation = await this.deps.installations.get(id);
        if (!installation) {
            throw new MissingIntegrationInstallationError(id);
        }
        return installation;
    }
    private async mutate(
        id: string,
        action: (installation: IntegrationInstallation) => Promise<unknown>,
    ): Promise<unknown> {
        if (this.writes.has(id)) {
            throw new IntegrationRuntimeError("Integration management operation is already running", 409);
        }
        this.writes.add(id);
        try {
            return await withManagementLease(this.deps, id, action);
        } finally {
            this.writes.delete(id);
            this.observer.invalidate(id);
        }
    }
}
