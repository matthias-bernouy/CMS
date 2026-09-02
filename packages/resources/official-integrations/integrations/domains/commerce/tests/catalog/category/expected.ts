export const categoryRow = {
    id: 9,
    parent_id: 3,
    slug: "tennis",
    full_slug: "sports/tennis",
    label: "Tennis",
    description: null,
    status: "active",
    position: 4,
    metadata: { seo_title: "Tennis rackets", internal_margin: 12 },
    version: 2,
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-04T10:00:00Z",
};

export const parentRow = {
    id: 3,
    slug: "sports",
    full_slug: "sports",
    label: "Sports",
    status: "inactive",
};

export const categoryFieldRows = [
    {
        category_id: 9,
        field_key: "grip",
        required: true,
        filterable: true,
        position: 1,
        definition: {
            label: "Grip",
            field_type: "enum",
            options: ["L1", "L2"],
            unit: null,
            public_readable: true,
            enabled: false,
        },
    },
    {
        category_id: 9,
        field_key: "weight",
        required: false,
        filterable: false,
        position: 1,
        definition: {
            label: "Weight",
            field_type: "number",
            options: [],
            unit: "g",
            public_readable: false,
            enabled: true,
        },
    },
];

const category = {
    id: 9,
    parentId: 3,
    slug: "tennis",
    fullSlug: "sports/tennis",
    label: "Tennis",
    description: null,
    status: "active",
    position: 4,
    metadata: { seo_title: "Tennis rackets", internal_margin: 12 },
    version: 2,
    createdAt: "2026-07-01T10:00:00Z",
    updatedAt: "2026-07-04T10:00:00Z",
};

export const parent = {
    id: 3,
    slug: "sports",
    fullSlug: "sports",
    label: "Sports",
    status: "inactive",
};

export const categoryFields = [
    {
        categoryId: 9,
        fieldKey: "grip",
        required: true,
        filterable: true,
        position: 1,
        definition: {
            label: "Grip",
            fieldType: "enum",
            options: ["L1", "L2"],
            unit: null,
            publicReadable: true,
            enabled: false,
        },
    },
    {
        categoryId: 9,
        fieldKey: "weight",
        required: false,
        filterable: false,
        position: 1,
        definition: {
            label: "Weight",
            fieldType: "number",
            options: [],
            unit: "g",
            publicReadable: false,
            enabled: true,
        },
    },
];

export const adminCategory = { ...category, parent, categoryFields };
export const publicCategory = { ...category, parent, categoryFields: [] };
export const rootCategory = {
    ...category,
    id: 3,
    parentId: null,
    slug: "sports",
    fullSlug: "sports",
    label: "Sports",
    description: "All sports",
    metadata: {},
    version: 5,
    parent: null,
    categoryFields: [],
};

export const adminSourceCategory = {
    ...category,
    parent,
    categoryFields: categoryFields.map((field) => ({
        fieldKey: field.fieldKey,
        required: field.required,
        filterable: field.filterable,
        position: field.position,
        definition: {
            label: field.definition.label,
            fieldType: field.definition.fieldType,
            unit: field.definition.unit,
        },
    })),
};
export const publicSourceCategory = { ...category, parent };

export const newCategory = {
    id: null,
    parentId: null,
    slug: "",
    fullSlug: "",
    label: "",
    description: "",
    status: "active",
    position: 0,
    metadata: {},
    categoryFields: [],
    version: 1,
};
