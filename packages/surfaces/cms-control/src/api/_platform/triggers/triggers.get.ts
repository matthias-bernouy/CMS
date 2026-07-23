import type { IntegrationInstallation } from "@bernouy/cms-integrations";
import type { TriggerRecord } from "@bernouy/cms-triggers";
import type { ControlCms } from "cms-control/ControlCms";

export type TriggerListItem = TriggerRecord & {
    schedulerAvailable: boolean;
    integration?: { id: string; label: string };
};
export type TriggerListResponse = TriggerListItem[];

export default async function listTriggers(_req: Request, cms: ControlCms): Promise<Response> {
    const repository = cms.triggers;
    if (!repository) {
        return new Response("triggers not configured", { status: 501 });
    }

    const [triggers, installations] = await Promise.all([
        repository.getAllTriggers(),
        cms.configuredIntegrationInstallations?.list() ?? Promise.resolve([]),
    ]);
    const owners = collectTriggerOwners(installations);
    triggers.sort((left, right) => left.id.localeCompare(right.id));
    return Response.json(
        triggers.map((trigger) => ({
            ...trigger,
            schedulerAvailable: cms.config?.scheduledTriggers?.enabled ?? false,
            ...(owners.get(trigger.id) ? { integration: owners.get(trigger.id) } : {}),
        })) satisfies TriggerListResponse,
    );
}

function collectTriggerOwners(installations: IntegrationInstallation[]): Map<string, { id: string; label: string }> {
    const owners = new Map<string, { id: string; label: string }>();
    for (const installation of installations) {
        for (const artifact of installation.artifacts) {
            if (artifact.type === "trigger") {
                owners.set(artifact.id, { id: installation.id, label: installation.label });
            }
        }
    }
    return owners;
}
