import { exampleCollection } from "../fixture";

export function bootstrapCollection() {
    const source = exampleCollection();
    for (const messages of Object.values(source.translations) as Record<string, string>[]) {
        Object.assign(messages, {
            "bootstrap.label": "Administration",
            "bootstrap.description": "Initialize ordinary Pages from examples.",
            "bootstrap.page-title": "Administration",
            "bootstrap.page-description": "Manage content.",
        });
    }
    source.bootstraps = [
        {
            id: "admin",
            label: "bootstrap.label",
            description: "bootstrap.description",
            requires: [],
            includes: [],
            pages: [
                {
                    id: "home",
                    exampleId: "assembled",
                    path: "/admin",
                    title: "bootstrap.page-title",
                    description: "bootstrap.page-description",
                    indexing: false,
                    visible: true,
                },
            ],
        },
    ];
    return source;
}

export function includedRecipe() {
    return {
        publisherId: "ulvia",
        collectionId: "ulvia/mossa",
        version: "1.1.0",
        digest: `sha256:${"a".repeat(64)}`,
        bootstrapId: "admin",
        omitPages: ["login"],
    };
}
