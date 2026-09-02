import { InMemoryIntegrationInstallationRepository } from "@bernouy/cms-integrations";

export async function seedInstallation(
    installations: InMemoryIntegrationInstallationRepository,
    id: "commerce" | "stripe-connect",
): Promise<void> {
    await installations.create({
        id,
        label: id,
        definitionVersion: "1.0.0",
        status: "success",
        answersSnapshot: { id },
        secretRefs: {},
        secretInputs: [],
        artifacts: [{ type: "source", id: `urn:${id}`, action: "created" }],
        runs: [],
    });
}
