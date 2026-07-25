export const tennisSchema = {
    category: { id: 1, parentId: null, slug: "tennis", fullSlug: "sports/tennis", label: "Tennis" },
    fields: [
        {
            key: "model_year",
            label: "Année",
            type: "number",
            required: false,
            filterable: true,
            position: 20,
            unit: null,
            operators: ["eq", "gte", "lte"],
            options: [],
            range: { minimum: 2020, maximum: 2024, step: 1 },
        },
        {
            key: "grip_size",
            label: "Taille de manche",
            type: "string",
            required: false,
            filterable: false,
            position: 5,
            unit: null,
            operators: ["eq", "in"],
            options: ["L1", "L2", "L3"],
        },
        {
            key: "string_pattern",
            label: "Plan de cordage",
            type: "string",
            required: false,
            filterable: true,
            position: 10,
            unit: null,
            operators: ["eq", "in"],
            options: ["16x19", "16x18"],
        },
    ],
    brands: [
        { id: 1, slug: "wilson", name: "Wilson" },
        { id: 2, slug: "head", name: "Head" },
    ],
};

export const padelSchema = {
    category: { id: 2, parentId: null, slug: "padel", fullSlug: "sports/padel", label: "Padel" },
    fields: [
        {
            key: "shape",
            label: "Forme",
            type: "string",
            required: false,
            filterable: true,
            position: 1,
            unit: null,
            operators: ["eq", "in"],
            options: ["Ronde", "Diamant", "Goutte d’eau"],
        },
    ],
    brands: [{ id: 3, slug: "bullpadel", name: "Bullpadel" }],
};
