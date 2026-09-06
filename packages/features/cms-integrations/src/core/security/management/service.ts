import { withManagementLease, verifyManagementLease, nextTime } from "./lease";
import type { IntegrationManagementActor } from "../../../interfaces/Integration/management";
import {
    IntegrationInputError,
    IntegrationManagementError,
    IntegrationRuntimeError,
    MissingIntegrationInstallationError,
} from "../../errors";
import type { IntegrationInstallation } from "../../../interfaces/IntegrationInstallation";
import type { IntegrationManagementDeps } from "./contracts";
import { IntegrationHealthObserver } from "./health";
import { invokeManagement, syncManagementRuntime } from "./invoke";
import { record } from "./report";
import { settingSecretRefs } from "./secrets";

export class IntegrationManagementService {
    private readonly observer: IntegrationHealthObserver;
    private readonly writes = new Set<string>();
    constructor(private readonly deps: IntegrationManagementDeps) {
        this.observer = new IntegrationHealthObserver(deps);
    }
    async health(id: string, refresh = false, actor?: IntegrationManagementActor) {
        return this.observer.read(await this.installation(id), refresh, actor);
    }
    async settings(id: string, actor?: IntegrationManagementActor): Promise<unknown> {
        const installation = await this.installation(id);
        const settings = installation.definitionSnapshot?.management?.settings;
        if (!settings) {
            throw new IntegrationRuntimeError("Integration settings are unavailable", 404);
        }
        return (
            await invokeManagement(
                this.deps,
                installation,
                settings.readFunctionId,
                "read-settings",
                {},
                undefined,
                false,
                actor,
            )
        ).public;
    }
    async saveSettings(
        id: string,
        input: Record<string, unknown>,
        actor?: IntegrationManagementActor,
    ): Promise<unknown> {
        return this.mutate(id, async (installation) => {
            const management = installation.definitionSnapshot?.management;
            if (!management?.settings) {
                throw new IntegrationRuntimeError("Integration settings are unavailable", 404);
            }
            const refs = settingSecretRefs(
                management,
                record(input.values) ? input.values : input,
                installation.managementSecretRefs ?? {},
            );
            const result = await invokeManagement(
                this.deps,
                installation,
                management.settings.saveFunctionId,
                "save-settings",
                input,
                refs,
                false,
                actor,
            );
            const current = await verifyManagementLease(this.deps, installation);
            const next = {
                ...current,
                managementSecretRefs: refs,
                updatedAt: nextTime(this.deps, current),
            };
            if (this.deps.installations.compareAndSwapMigration) {
                if (!(await this.deps.installations.compareAndSwapMigration(current, next))) {
                    throw new IntegrationRuntimeError(
                        "Integration changed while settings were saved; retry settings save",
                        409,
                    );
                }
            } else {
                await this.deps.installations.replace(next);
            }
            if (management.settings.applyFunctionId) {
                try {
                    return await this.apply(
                        next,
                        { expectedRevision: result.raw.savedRevision, savedRevision: result.raw.savedRevision },
                        actor,
                    );
                } catch (error) {
                    throw new IntegrationManagementError(
                        `Configuration saved; application failed: ${error instanceof Error ? error.message : "retry applying configuration"}`,
                        error instanceof IntegrationRuntimeError ? error.status : 502,
                        error instanceof IntegrationManagementError ? error.publicCode : "integration_apply_failed",
                    );
                }
            }
            return result.public;
        });
    }
    async action(
        id: string,
        actionId: string,
        input: Record<string, unknown> = {},
        actor?: IntegrationManagementActor,
    ): Promise<unknown> {
        return this.mutate(id, async (installation) => {
            const management = installation.definitionSnapshot?.management;
            if (actionId === "apply-settings" && management?.settings?.applyFunctionId) {
                return this.apply(installation, input, actor);
            }
            const action = management?.actions?.find(({ id }) => id === actionId);
            if (!action) {
                throw new IntegrationInputError("actionId", "must reference a declared management action");
            }
            return (
                await invokeManagement(
                    this.deps,
                    installation,
                    action.functionId,
                    "action",
                    input,
                    undefined,
                    false,
                    actor,
                    actionId,
                )
            ).public;
        });
    }
    private async apply(
        installation: IntegrationInstallation,
        input: Record<string, unknown>,
        actor?: IntegrationManagementActor,
    ): Promise<unknown> {
        const functionId = installation.definitionSnapshot!.management!.settings!.applyFunctionId!;
        const result = await invokeManagement(
            this.deps,
            installation,
            functionId,
            "apply-settings",
            input,
            undefined,
            true,
            actor,
        );
        await syncManagementRuntime(this.deps, installation, result.raw, result.secretValues);
        return (
            await invokeManagement(
                this.deps,
                installation,
                functionId,
                "confirm-apply",
                { savedRevision: result.raw.savedRevision },
                undefined,
                false,
                actor,
            )
        ).public;
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
