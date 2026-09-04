import { describe, expect, test } from "bun:test";
import {
    assertCollectionConformance,
    resolveCollectionSelection,
    type CollectionIntegrationDefinition,
    type DeclarativeBlocArtifactTemplate,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { buildBloc, decodeSource } from "./source";

describe("Mossa collection 3.0.0", () => {
    test("publishes the complete Mossa catalogue without duplicating Ulvia tags", async () => {
        const { definitions, mossa, ulvia } = await catalogue();
        const artifacts = blocArtifacts(mossa);
        const tags = artifacts.map(({ bloc }) => bloc.tag);
        const ulviaTags = new Set(blocArtifacts(ulvia).map(({ bloc }) => bloc.tag));

        expect(mossa.resources).toHaveLength(152);
        expect(artifacts).toHaveLength(152);
        expect(new Set(tags).size).toBe(tags.length);
        expect(tags.filter((tag) => ulviaTags.has(tag))).toEqual([]);
        expect(mossa.resources.every(({ id }) => id.startsWith("mossa/blocs/"))).toBe(true);
        expect(() => assertCollectionConformance(mossa, definitions)).not.toThrow();
    });

    test("makes every resource opt-in and resolves cross-collection dependencies", async () => {
        const { definitions, mossa } = await catalogue();
        expect(mossa.resources.every(({ defaultActive }) => defaultActive !== true)).toBe(true);

        const selection = resolveCollectionSelection(mossa, ["mossa/blocs/cs-checkout-flow"], undefined, definitions);
        expect(selection.requiredCollections).toContainEqual({
            kind: "ulvia",
            version: "4.0.0",
            resources: [
                "ulvia/blocs/basic-button",
                "ulvia/blocs/basic-card",
                "ulvia/blocs/basic-grid",
                "ulvia/blocs/basic-input",
                "ulvia/blocs/basic-option",
                "ulvia/blocs/basic-select",
                "ulvia/blocs/basic-skeleton",
                "ulvia/blocs/commerce-stripe-payment",
                "ulvia/blocs/mondial-relay-picker",
            ],
        });
        expect(selection.requiredSources).toEqual(
            expect.arrayContaining([
                { kind: "commerce", versionRange: "^3.0.0" },
                { kind: "commerce-mondial-relay-delivery", versionRange: "^3.0.0" },
                { kind: "commerce-stripe-payments", versionRange: "^4.0.0" },
                { kind: "user-account", versionRange: "^3.0.0" },
            ]),
        );
    });

    test("uses the generic Commerce order-field contract for the club UI", async () => {
        const { mossa } = await catalogue();
        for (const id of ["mossa/blocs/cs-club-lookup", "mossa/blocs/cs-checkout-flow"]) {
            const resource = mossa.resources.find((candidate) => candidate.id === id)!;
            expect(resource.endpoints).toContainEqual(
                expect.objectContaining({
                    source: "commerce",
                    endpoint: "urn:commerce:entityCustomFields",
                    contractVersion: "^1.0.0",
                }),
            );
        }
        const sources = blocArtifacts(mossa)
            .flatMap(({ bloc }) => Object.values(bloc.source ?? {}))
            .map(decodeSource)
            .join("\n");
        expect(sources).toContain("entityCustomFields?entityType=order");
        expect(sources).not.toContain("getCheckoutClubField");
    });

    test("consumes the Ulvia theme contract without duplicating its tokens", async () => {
        const { mossa } = await catalogue();
        expect(mossa.theme?.dependencies).toContainEqual({ kind: "ulvia", versionRange: "^4.0.0" });
        expect(mossa.theme?.categories).toEqual([]);
        expect(mossa.resources.every(({ theme }) => !theme || theme.contract === "ulvia-theme@3")).toBe(true);

        const sources = blocArtifacts(mossa)
            .flatMap(({ bloc }) => Object.values(bloc.source ?? {}))
            .map(decodeSource)
            .join("\n");
        expect(sources).toContain("--ulvia-primary-base");
        expect(sources).toContain("--mossa-hero-marketing-background");
        expect(sources).toContain("--_mossa-hero-marketing-accent");
        expect(sources).not.toContain("--integration-");
        expect(sources).not.toContain("--ctx-");
        expect(sources).not.toContain("--site-");
    });

    test("does not retain files from the source CMS instance", async () => {
        const { mossa } = await catalogue();
        const sources = blocArtifacts(mossa)
            .flatMap(({ bloc }) => Object.values(bloc.source ?? {}))
            .map(decodeSource)
            .join("\n");

        expect(sources).not.toContain("/.cms/files/by-id/");
    });

    test("keeps the logo visual-only and delegates navigation to the header composition", async () => {
        const { mossa } = await catalogue();
        const artifacts = blocArtifacts(mossa);
        const logo = artifacts.find(({ bloc }) => bloc.tag === "cs-logo")!;
        const header = artifacts.find(({ bloc }) => bloc.tag === "site-header")!;

        expect(decodeSource(logo.bloc.source?.["template.html"])).not.toContain("<a");
        expect(header.bloc.compositionHTML).toContain('<a slot="brand" href="/"');
        expect(header.bloc.compositionHTML).not.toMatch(/<cs-logo[^>]*\shref=/);
    });

    test("validates and builds all imported block sources", async () => {
        const { mossa } = await catalogue();
        for (const artifact of blocArtifacts(mossa)) {
            await buildBloc(artifact);
        }
    }, 120_000);
});

async function catalogue(): Promise<{
    definitions: IntegrationDefinition[];
    mossa: CollectionIntegrationDefinition;
    ulvia: CollectionIntegrationDefinition;
}> {
    const repository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
    const definitions = (await Promise.all((await repository.list()).map(({ kind }) => repository.get(kind)))).filter(
        (definition): definition is IntegrationDefinition => definition !== null,
    );
    const collections = definitions.filter(
        (definition): definition is CollectionIntegrationDefinition =>
            definition.schema === "cms.integration.definition.v2" && definition.type === "collection",
    );
    return {
        definitions,
        mossa: collections.find(({ kind }) => kind === "mossa")!,
        ulvia: collections.find(({ kind }) => kind === "ulvia")!,
    };
}

function blocArtifacts(definition: CollectionIntegrationDefinition): DeclarativeBlocArtifactTemplate[] {
    return (definition.artifacts ?? []).filter(
        (artifact): artifact is DeclarativeBlocArtifactTemplate => artifact.type === "bloc",
    );
}
