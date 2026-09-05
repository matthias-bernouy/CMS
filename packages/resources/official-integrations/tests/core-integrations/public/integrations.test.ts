import { expect, test } from "bun:test";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

test("every official source endpoint declares response outputs", async () => {
    const repository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
    const missing: string[] = [];

    for (const entry of await repository.list()) {
        const definition = await repository.get(entry.kind);
        for (const artifact of definition?.artifacts ?? []) {
            if (artifact.type !== "source") {
                continue;
            }
            for (const endpoint of artifact.source.endpoints) {
                if (!endpoint.output?.length) {
                    missing.push(`${entry.kind}:${artifact.source.id}:${endpoint.endpointId}`);
                }
            }
        }
    }

    expect(missing).toEqual([]);
});
