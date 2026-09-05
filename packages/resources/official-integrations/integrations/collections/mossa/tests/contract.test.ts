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
import { parseTableData } from "../blocs/foundation/content/display/table/tableData";
import { buildBloc, decodeDefaultContent, decodeSource } from "./source";

describe("Mossa collection 1.1.0", () => {
    test("publishes one site-neutral, fully namespaced catalogue", async () => {
        const { definitions, mossa } = await catalogue();
        const artifacts = blocArtifacts(mossa);
        const tags = artifacts.map(({ bloc }) => bloc.tag);

        expect(mossa.version).toBe("1.1.0");
        expect(mossa.resources).toHaveLength(95);
        expect(artifacts).toHaveLength(95);
        expect(new Set(tags).size).toBe(tags.length);
        expect(tags.every((tag) => tag.startsWith("mossa-"))).toBe(true);
        expect(mossa.resources.every(({ id }) => id.startsWith("mossa/blocs/"))).toBe(true);
        expect(mossa.resources.every(({ artifact }) => artifact.startsWith("mossa-"))).toBe(true);
        expect(mossa.resources.every(({ defaultActive }) => defaultActive !== true)).toBe(true);
        expect(() => assertCollectionConformance(mossa, definitions)).not.toThrow();

        const sources = sourceText(artifacts);
        const nestedCustomTags = [...sources.matchAll(/<\/?([a-z][a-z0-9]*-[a-z0-9-]+)/gi)].map(([, tag]) => tag!);
        expect(nestedCustomTags.every((tag) => tag.startsWith("mossa-"))).toBe(true);
        expect(sources).not.toMatch(/href=["']\/(?!\.cms\/)/i);
        expect(sources).toContain('attribute: "locale"');
        expect(sources).toContain('attribute: "currency"');
        expect(sources).toContain('attribute: "country"');
        expect(sources).toContain('attribute: "country-code"');
        expect(tags).not.toContain("site-header");
        expect(tags).not.toContain("site-footer");
        expect(artifacts.find(({ bloc }) => bloc.tag === "mossa-link")?.bloc.nativeElement).toBe("a");
    });

    test("contains no retired collection implementation naming", async () => {
        const { mossa } = await catalogue();
        const implementation = [
            sourceText(blocArtifacts(mossa)),
            JSON.stringify(mossa.artifacts),
            JSON.stringify(mossa.resources),
        ].join("\n");
        const oldCollectionStem = ["Ba", "sic"].join("");
        const oldLowerStem = oldCollectionStem.toLowerCase();
        const oldMetadataWord = ["leg", "acy"].join("");

        expect(implementation).not.toMatch(
            new RegExp(
                String.raw`\b(?:${oldCollectionStem}[A-Z]\w*|${oldLowerStem}[A-Z]\w*|${oldCollectionStem.toUpperCase()}_[A-Z0-9_]+)\b`,
            ),
        );
        expect(implementation).not.toMatch(new RegExp(String.raw`\b(?:${oldLowerStem}|base)-[a-z0-9-]+`, "i"));
        expect(implementation).not.toMatch(
            new RegExp(
                `${oldMetadataWord} editor metadata|_${oldMetadataWord}(?:StateTarget|EditorStyle)|${oldMetadataWord}-state-0`,
            ),
        );
    });

    test("resolves checkout entirely inside Mossa plus Source contracts", async () => {
        const { definitions, mossa } = await catalogue();
        const selection = resolveCollectionSelection(mossa, ["mossa/blocs/checkout"], undefined, definitions);

        expect(selection.requiredCollections).toEqual([]);
        expect(selection.effectiveResources).toEqual([
            {
                kind: "mossa",
                resources: [
                    "mossa/blocs/button",
                    "mossa/blocs/checkout",
                    "mossa/blocs/commerce-stripe-payment",
                    "mossa/blocs/input",
                    "mossa/blocs/mondial-relay-picker",
                    "mossa/blocs/option",
                    "mossa/blocs/responsive-grid",
                    "mossa/blocs/select",
                    "mossa/blocs/skeleton",
                    "mossa/blocs/surface-card",
                ],
            },
        ]);
        expect(selection.requiredSources).toEqual(
            expect.arrayContaining([
                { kind: "commerce", versionRange: "^1.0.0" },
                { kind: "commerce-mondial-relay-delivery", versionRange: "^1.0.0" },
                { kind: "commerce-stripe-payments", versionRange: "^1.0.0" },
                { kind: "mondial-relay", versionRange: ">=1.0.0 <3.0.0" },
                { kind: "user-account", versionRange: "^1.0.0" },
            ]),
        );
    });

    test("uses the generic Commerce order-field contract inside checkout", async () => {
        const { mossa } = await catalogue();
        const resource = mossa.resources.find((candidate) => candidate.id === "mossa/blocs/checkout")!;
        expect(resource.endpoints).toContainEqual(
            expect.objectContaining({
                source: "commerce",
                endpoint: "urn:commerce:entityCustomFields",
                contractVersion: "^1.0.0",
            }),
        );
        const sources = sourceText(blocArtifacts(mossa));
        expect(sources).toContain("entityCustomFields?entityType=order");
    });

    test("depends on Ulvia only for its public token contract", async () => {
        const { mossa, ulvia } = await catalogue();
        expect(ulvia.resources).toEqual([]);
        expect(ulvia.artifacts).toEqual([]);
        expect(mossa.theme?.dependencies).toEqual([{ kind: "ulvia", versionRange: "^1.0.0" }]);
        expect(mossa.theme?.categories).toEqual([]);
        expect(mossa.resources.every(({ theme }) => !theme || theme.contract === "ulvia-theme@3")).toBe(true);

        const sources = sourceText(blocArtifacts(mossa));
        expect(sources).toContain("--ulvia-primary-base");
        expect(sources).toContain("--_mossa-hero-marketing-accent");
        expect(sources).not.toMatch(/--(?:integration|ctx|p9r|site)-/);
        expect(
            customPropertyReferences(sources).filter(
                (property) => property !== "--ulvia-" && !/^--(?:ulvia|mossa|_mossa)-[a-z0-9-]+$/.test(property),
            ),
        ).toEqual([]);

        const publishedTokens = (ulvia.theme?.categories ?? [])
            .flatMap(({ tokens }) => tokens.map(({ id }) => id))
            .sort();
        const consumedTokens = tokenReferences(sources);
        expect(consumedTokens).toEqual(publishedTokens);

        const artifacts = blocArtifacts(mossa);
        for (const resource of mossa.resources) {
            const artifact = artifacts.find(({ bloc }) => bloc.tag === resource.artifact)!;
            const required = tokenReferences(sourceText([artifact]));
            expect(resource.theme?.required ?? []).toEqual(required);
            expect(resource.theme?.contract).toBe(required.length > 0 ? "ulvia-theme@3" : undefined);
        }
    });

    test("owns one structured table instead of exposing table primitives", async () => {
        const { mossa } = await catalogue();
        const table = blocArtifacts(mossa).find(({ bloc }) => bloc.tag === "mossa-table")!;
        const defaultContent = decodeDefaultContent(table.bloc.source)!;
        const template = document.createElement("template");
        template.innerHTML = defaultContent;
        const element = template.content.firstElementChild!;
        const data = parseTableData(element.getAttribute("columns"), element.getAttribute("rows"));

        expect(data).toEqual({
            columns: ["Item", "Policy"],
            rows: [
                ["Published price", "The displayed price applies."],
                ["Delivery", "Quoted before payment."],
            ],
        });
        expect(table.bloc.editorJS).toContain('attribute: "columns"');
        expect(table.bloc.editorJS).toContain('attribute: "rows"');
        expect(mossa.resources.some(({ id }) => /(?:table-row|table-cell)$/.test(id))).toBe(false);
    });

    test("validates and builds every retained block", async () => {
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

function sourceText(artifacts: DeclarativeBlocArtifactTemplate[]): string {
    return artifacts
        .flatMap(({ bloc }) => Object.values(bloc.source ?? {}))
        .map(decodeSource)
        .join("\n");
}

function tokenReferences(source: string): string[] {
    return [...source.matchAll(/--ulvia-([a-z0-9-]+)/g)]
        .map(([, id]) => id)
        .filter(unique)
        .sort();
}

function customPropertyReferences(source: string): string[] {
    return [...source.matchAll(/--[A-Za-z_][A-Za-z0-9_-]*/g)]
        .map(([property]) => property)
        .filter(unique)
        .sort();
}

function unique(value: string, index: number, values: string[]): boolean {
    return values.indexOf(value) === index;
}
