import { expect, test } from "bun:test";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

test("only collections publish theme contracts", async () => {
    const repository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
    const findings: string[] = [];

    for (const entry of await repository.list()) {
        const definition = await repository.get(entry.kind);
        if (definition?.type !== "collection" && definition?.theme !== undefined) {
            findings.push(`${entry.kind} (${definition?.type ?? "unknown"}) publishes a theme`);
        }
    }

    expect(findings).toEqual([]);
});
