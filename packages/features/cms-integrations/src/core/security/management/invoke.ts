import { verifyManagementLease } from "./lease";
import { resolveManagementPages } from "./pages";
import type { IntegrationInstallation } from "../../../interfaces/IntegrationInstallation";
import type {
    IntegrationManagementOperation,
    IntegrationManagementActor,
} from "../../../interfaces/Integration/management";
import { IntegrationRuntimeError, IntegrationManagementError } from "../../errors";
import type { IntegrationManagementDeps } from "./contracts";
import { managementSecrets, publicResult } from "./secrets";
import { record } from "./report";

export async function invokeManagement(
    deps: IntegrationManagementDeps,
    installation: IntegrationInstallation,
    functionId: string,
    operation: IntegrationManagementOperation,
    input: Record<string, unknown> = {},
    actor?: IntegrationManagementActor,
    actionId?: string,
) {
    if (operation !== "health") {
        await verifyManagementLease(deps, installation);
    }
    const secrets = await managementSecrets(
        deps,
        installation,
        installation.managementSecretRefs ?? {},
        operation === "health",
    );
    const resolvedPages =
        operation === "action"
            ? await resolveManagementPages(
                  deps,
                  installation.definitionSnapshot?.management?.actions?.find((action) => action.id === actionId)
                      ?.fields ?? [],
                  record(input.values) ? input.values : input,
              )
            : {};
    let result: unknown;
    try {
        result = await deps.invoke(
            installation,
            functionId,
            {
                operation,
                ...(actionId ? { actionId } : {}),
                resolvedPages,
                ...(actor ? { actor } : {}),
                installationId: installation.id,
                definitionVersion: installation.definitionVersion,
                input,
                secretValues: secrets.secretValues,
                generatedSecretValues: secrets.generatedSecretValues,
            },
            secrets.reader,
        );
    } catch (error) {
        const status = error instanceof IntegrationRuntimeError ? error.status : 502;
        const message =
            error instanceof IntegrationRuntimeError && status >= 400 && status < 500
                ? (publicResult(error.message, [
                      ...Object.values(secrets.secretValues),
                      ...Object.values(secrets.generatedSecretValues),
                  ]) as string)
                : "Integration management function is unavailable";
        throw new IntegrationManagementError(
            message,
            status,
            error instanceof IntegrationManagementError ? error.publicCode : undefined,
        );
    }
    if (operation === "health" && (!record(result) || result.generatedSecrets !== undefined)) {
        return null;
    }
    if (!record(result)) {
        throw new IntegrationRuntimeError("Invalid integration management response", 502);
    }
    if (result.generatedSecrets !== undefined || result._cms !== undefined) {
        throw new IntegrationRuntimeError("Infrastructure effects require an integration Source endpoint", 502);
    }
    return publicResult(result, [
        ...Object.values(secrets.secretValues),
        ...Object.values(secrets.generatedSecretValues),
    ]);
}
