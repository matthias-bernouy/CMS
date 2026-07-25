import type { IntegrationInstallationRepository } from "../../../interfaces/IntegrationInstallationRepository";
import { failedRun } from "./runs";

export async function markAfterInstallationFailed(
    installations: IntegrationInstallationRepository,
    installationId: string,
    error: unknown,
): Promise<void> {
    const installation = await installations.get(installationId);
    if (!installation) {
        return;
    }
    const previousRun = installation.runs.find((run) => run.runNumber === installation.runCount);
    if (!previousRun) {
        await installations.replace({ ...installation, status: "failed", updatedAt: new Date() });
        return;
    }
    const failure = {
        ...failedRun(previousRun.runNumber, previousRun.startedAt, error),
        id: previousRun.id,
        artifacts: previousRun.artifacts,
        ...(previousRun.secrets ? { secrets: previousRun.secrets } : {}),
        ...(previousRun.connectors ? { connectors: previousRun.connectors } : {}),
    };
    await installations.replace({
        ...installation,
        status: "failed",
        updatedAt: failure.finishedAt,
        runs: installation.runs.map((run) => (run.id === previousRun.id ? failure : run)),
    });
}
