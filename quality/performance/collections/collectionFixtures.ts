import { admitCollectionRelease } from "@bernouy/cms-repository/collections";

export function collectionFixture(blocCount: number, exampleCount: number, version = "1.0.0") {
    const messages: Record<string, string> = { "collection.name": "Performance collection", content: "Content" };
    const blocs = Array.from({ length: blocCount }, (_, index) => {
        const id = `performance-suite-card-${index}`;
        const label = `bloc.${id}.label`;
        messages[label] = `Performance card ${index}`;
        return {
            kind: "component",
            root: { accepts: ["div"] },
            id,
            label,
            description: label,
            categories: ["content"],
            catalogue: "hidden",
            markup: '<article><slot name="body"></slot></article>',
            slots: { body: { accepts: [{ kind: "native-content", profile: "prose" }] } },
            uses: [],
            requires: [],
        };
    });
    const examples = Array.from({ length: exampleCount }, (_, index) => {
        const name = `page.${index}.name`;
        messages[name] = `Performance page ${index}`;
        return {
            id: `page-${index}`,
            label: name,
            description: name,
            requires: [],
            previews: [{ id: "desktop", frame: { width: 1280, height: 720 } }],
            document: {
                html: `<div cms-bloc=\"performance-suite-card-${index % blocCount}\"></div>`,
            },
        };
    });
    return {
        kind: "collection",
        protocol: "ulvia-collection/v1",
        schemaDialect: "ulvia-schema/v1",
        collectionId: "performance-suite",
        publisherId: "ulvia.performance",
        version,
        name: "collection.name",
        locale: "en",
        translations: { en: messages },
        assets: [],
        blocs,
        examples,
    };
}

export async function admittedFixture(blocCount: number, exampleCount: number, version: string) {
    return admitCollectionRelease(collectionFixture(blocCount, exampleCount, version));
}
