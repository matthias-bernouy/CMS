import { InMemoryCmsRepository } from "@bernouy/cms-content";
import {
    parseIntegrationDefinition,
    type CollectionIntegrationDefinition,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { makeCms, createInstallation } from "../integrations/support/helpers";
import { seedBloc, seedSiteBloc, seedPublishedSiteBloc, siteSnapshot } from "../site-blocs/fixtures";

export function collectionDefinition(kind = "gallery"): CollectionIntegrationDefinition {
    return parseIntegrationDefinition({
        schema: "cms.integration.definition.v2",
        type: "collection",
        kind,
        label: kind,
        version: "1.2.3",
        inputs: [],
        icon: { path: "assets/icon.svg" },
        resourceCategories: [{ id: "layout", label: "Layout" }],
        resources: ["card", "banner", "retained"].map((name) => ({
            id: `${kind}/blocs/${name}`,
            type: "bloc",
            artifact: `${kind}-${name}`,
            category: "layout",
            ...(name === "card" ? { defaultActive: true } : {}),
        })),
        artifacts: ["card", "banner", "retained"].map((name) => ({
            type: "bloc",
            bloc: { tag: `${kind}-${name}`, name, compositionHTML: `<p>${name}</p>` },
        })),
    }) as CollectionIntegrationDefinition;
}

export async function libraryHarness() {
    const definition = collectionDefinition();
    definition.cover = { path: "assets/cover.webp", alt: "Gallery collection" };
    const available = collectionDefinition("additional");
    const harness = makeCms([definition, available]);
    const repository = new InMemoryCmsRepository();
    harness.cms.repository = repository;
    await createInstallation(harness.integrationInstallations, "gallery");
    const installed = (await harness.integrationInstallations.get("gallery"))!;
    await harness.integrationInstallations.replace({
        ...installed,
        status: "success",
        definitionVersion: definition.version!,
        definitionSnapshot: definition,
        activeResources: ["gallery/blocs/card", "gallery/blocs/retained"],
        answersSnapshot: { privateValue: "do-not-project" },
    });
    const site = await repository.createSiteBlocCollection({ name: "Campaigns", description: "Seasonal content" });
    await seedSiteBloc(repository, "site-legacy", siteSnapshot({ name: "Legacy draft", group: "Content" }));
    await seedPublishedSiteBloc(repository, "site-header", siteSnapshot({ name: "Header", group: "Layout" }));
    for (const [tag, group, active] of [
        ["gallery-card", "Content", true],
        ["gallery-banner", "Layout", false],
    ] as const) {
        await seedBloc(repository, tag, {
            group,
            thumbnail: { path: `assets/${tag}.webp`, alt: tag },
            catalogue: active ? "active" : "inactive",
            ownership: {
                kind: "integration",
                installationId: "gallery",
                integrationKind: "gallery",
                definitionVersion: "1.2.3",
            },
        });
    }
    await seedBloc(repository, "missing-card", {
        ownership: {
            kind: "integration",
            installationId: "missing",
            integrationKind: "missing",
            definitionVersion: "1.0.0",
        },
    });
    await seedBloc(repository, "code-card");
    return { ...harness, repository, definition, available, site };
}

export async function addLegacyInstallation(harness: Awaited<ReturnType<typeof libraryHarness>>) {
    const legacy: IntegrationDefinition = { kind: "legacy", label: "Legacy", version: "1.0.0", inputs: [] };
    await createInstallation(harness.integrationInstallations, legacy.kind);
    const installed = (await harness.integrationInstallations.get(legacy.kind))!;
    await harness.integrationInstallations.replace({ ...installed, status: "success", definitionSnapshot: legacy });
    await seedBloc(harness.repository, "legacy-card", {
        ownership: {
            kind: "integration",
            installationId: "legacy",
            integrationKind: "legacy",
            definitionVersion: "1.0.0",
        },
    });
}
