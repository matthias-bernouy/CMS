import { expect, test } from "bun:test";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

test("official integration subpaths stay stable across physical grouping", async () => {
    const repository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
    const integrationKinds = (await repository.list()).map(({ kind }) => kind);
    const exportedKinds = await Promise.all(
        integrationKinds.map(async (kind) => {
            const module = await import(`@bernouy/cms-official-integrations/integrations/${kind}/integration.json`);
            return module.default.kind;
        }),
    );

    expect(exportedKinds).toEqual(integrationKinds);
});
