export const category = {
    id: 9,
    parentId: 3,
    slug: "tennis",
    fullSlug: "sports/tennis",
    label: "Tennis",
};

export const fields = [
    {
        key: "grip",
        label: "Grip",
        type: "enum",
        options: ["L1", "L2"],
        required: true,
        filterable: true,
        position: 1,
        unit: null,
        operators: ["eq", "in"],
    },
    {
        key: "weight",
        label: "Weight",
        type: "number",
        options: [],
        required: false,
        filterable: true,
        position: 1,
        unit: "g",
        operators: ["eq", "gte", "lte"],
    },
    {
        key: "collectible",
        label: "Collectible",
        type: "boolean",
        options: [],
        required: false,
        filterable: false,
        position: 2,
        unit: null,
        operators: ["eq"],
    },
];

export const brands = [
    { id: 5, slug: "alpha", name: "Alpha" },
    { id: 2, slug: "same-two", name: "Same" },
    { id: 10, slug: "same-ten", name: "Same" },
];

export const filterSchema = { category, fields };
export const filterSchemaResponse = {
    category,
    fields: fields.map((field) =>
        field.key === "weight"
            ? {
                  ...field,
                  range: {
                      minimum: 280.5,
                      maximum: 325.25,
                      step: 0.000001,
                  },
              }
            : field,
    ),
    brands,
};
export const emptyFilterSchema = {
    category: {
        id: 3,
        parentId: null,
        slug: "sports",
        fullSlug: "sports",
        label: "Sports",
    },
    fields: [],
};
export const emptyFilterSchemaResponse = { ...emptyFilterSchema, brands: [] };
