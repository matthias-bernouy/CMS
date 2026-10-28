import { collectionDocument, textDefinition } from "../../fixtures";

export function exampleCollection(): any {
    const release: any = collectionDocument({
        "bloc.description": "An editable panel.",
        "category.layout": "Layout",
        "category.content": "Content",
        "example.label": "Panel example",
        "example.description": "A panel containing a greeting.",
    });
    release.protocol = "ulvia-collection/v1";
    release.texts = [textDefinition("greeting", { "en-US": "Hello <copy>", en: "Hello <copy>", fr: "Bonjour" })];
    for (const bloc of release.blocs) {
        bloc.catalogue = "listed";
        bloc.description = "bloc.description";
        bloc.categories = ["category.layout", "category.content"];
        bloc.examples = [bloc.id + "-default", "assembled"];
        bloc.defaultExample = bloc.id + "-default";
    }
    release.blocs[0].settings = [
        { id: "tone", type: "string", default: "neutral", label: "example.label", control: { kind: "text" } },
    ];
    const sample = (id: string, html: string) => ({
        id,
        label: "example.label",
        description: "example.description",
        document: { html },
        previews: [{ id: "desktop", frame: { width: 640, height: 240 } }],
    });
    const panel = '<div cms-bloc="atlas-panel" tone="accent"><p slot="body">{{ cms.i18n.atlas.greeting }}</p></div>';
    release.examples = [
        sample("atlas-panel-default", panel),
        sample(
            "atlas-page-default",
            '<div cms-bloc="atlas-page"><p slot="main">{{ cms.i18n.atlas.greeting }}</p></div>',
        ),
        sample("assembled", panel + panel),
    ];
    return release;
}
