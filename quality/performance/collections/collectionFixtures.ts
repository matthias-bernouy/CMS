import { admitCollectionRelease } from "@bernouy/cms-repository/collections";

export function collectionFixture(blocCount: number, pageCount: number, version = "1.0.0") {
    const messages: Record<string, string> = { "collection.name": "Performance collection" };
    const blocs = Array.from({ length: blocCount }, (_, index) => {
        const id = `performance-suite-card-${index}`;
        const label = `bloc.${id}.label`;
        messages[label] = `Performance card ${index}`;
        return {
            kind: "component",
            root: { accepts: ["div"] },
            id,
            label,
            template: '<article><slot name="body"></slot></article>',
            slots: { body: { accepts: [{ kind: "native-content", profile: "prose" }] } },
            uses: [],
            requires: [],
        };
    });
    const pages = Array.from({ length: pageCount }, (_, index) => {
        const name = `page.${index}.name`;
        messages[name] = `Performance page ${index}`;
        return {
            id: `page-${index}`,
            defaultPath: `/performance-${index}`,
            name,
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
        ...(pages.length ? { pages } : {}),
    };
}

export async function admittedFixture(blocCount: number, pageCount: number, version: string) {
    return admitCollectionRelease(collectionFixture(blocCount, pageCount, version));
}
