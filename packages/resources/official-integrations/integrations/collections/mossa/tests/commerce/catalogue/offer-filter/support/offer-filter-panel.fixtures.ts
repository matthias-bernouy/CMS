export const primarySchema = {
    category: { id: 1, parentId: null, slug: "primary", fullSlug: "catalog/primary", label: "Primary category" },
    fields: [
        {
            key: "numeric_attribute",
            label: "Numeric attribute",
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
            key: "hidden_attribute",
            label: "Hidden attribute",
            type: "string",
            required: false,
            filterable: false,
            position: 5,
            unit: null,
            operators: ["eq", "in"],
            options: ["alpha", "beta", "gamma"],
        },
        {
            key: "choice_attribute",
            label: "Choice attribute",
            type: "string",
            required: false,
            filterable: true,
            position: 10,
            unit: null,
            operators: ["eq", "in"],
            options: ["alpha", "beta"],
        },
    ],
    brands: [
        { id: 1, slug: "brand-a", name: "Brand A" },
        { id: 2, slug: "brand-b", name: "Brand B" },
    ],
};

export const secondarySchema = {
    category: { id: 2, parentId: null, slug: "secondary", fullSlug: "catalog/secondary", label: "Secondary category" },
    fields: [
        {
            key: "alternate_attribute",
            label: "Alternate attribute",
            type: "string",
            required: false,
            filterable: true,
            position: 1,
            unit: null,
            operators: ["eq", "in"],
            options: ["alpha", "beta", "gamma"],
        },
    ],
    brands: [{ id: 3, slug: "brand-c", name: "Brand C" }],
};
