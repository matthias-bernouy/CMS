import { describe, expect, test } from "bun:test";
import type { BlocOwnership } from "@bernouy/cms-content";
import { BlocImportError, importBlocArtifact } from "cms-control/core/content/bloc/importBlocArtifact";
import { seedBloc, seedSiteBloc, siteBlocHarness } from "./fixtures";

const codeOwner: BlocOwnership = { kind: "code-managed" };
const integrationOwner = (installationId = "installation-1", definitionVersion = "1.0.0") => ({
    kind: "integration" as const,
    integrationKind: "catalogue",
    installationId,
    definitionVersion,
});
const siteOwner: BlocOwnership = { kind: "site-builder", definitionId: "definition-site-owned" };

async function seedOwned(tag: string, ownership: BlocOwnership) {
    const fixture = siteBlocHarness();
    if (ownership.kind === "site-builder") {
        await seedSiteBloc(fixture.repository, tag);
    } else {
        await seedBloc(fixture.repository, tag, { ownership });
    }
    return fixture;
}

async function forceImport(cms: ReturnType<typeof siteBlocHarness>["cms"], tag: string, ownership: BlocOwnership) {
    return importBlocArtifact(
        cms,
        {
            tag,
            name: "Forced update",
            group: "Test",
            description: "Cross-owner force attempt",
            viewJS: "/* valid empty view */",
            force: true,
        },
        { ownership },
    );
}

describe("force import ownership boundaries", () => {
    test.each([
        ["code to integration", codeOwner, integrationOwner()],
        ["integration to code", integrationOwner(), codeOwner],
        ["site builder to code", siteOwner, codeOwner],
        ["site builder to integration", siteOwner, integrationOwner()],
        ["code to site builder", codeOwner, siteOwner],
    ] as const)("rejects a cross-owner force: %s", async (_label, current, incoming) => {
        const tag = `cross-${current.kind}-${incoming.kind}`;
        const { cms, repository } = await seedOwned(tag, current);
        const before = await repository.getBlocRecord(tag);

        let failure: unknown;
        try {
            await forceImport(cms, tag, incoming);
        } catch (error) {
            failure = error;
        }

        expect(failure).toBeInstanceOf(BlocImportError);
        expect((failure as BlocImportError).status).toBe(409);
        expect(await repository.getBlocRecord(tag)).toEqual(before);
    });

    test("allows force for the same integration installation across definition versions", async () => {
        const { cms, repository } = await seedOwned("catalogue-grid", integrationOwner());

        await expect(forceImport(cms, "catalogue-grid", integrationOwner("installation-1", "1.1.0"))).resolves.toEqual({
            id: "catalogue-grid",
            action: "updated",
        });
        expect((await repository.getBlocRecord("catalogue-grid"))?.ownership).toEqual(
            integrationOwner("installation-1", "1.1.0"),
        );
    });
});
