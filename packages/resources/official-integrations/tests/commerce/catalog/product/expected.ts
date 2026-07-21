export const productRow = {
    id: 42,
    slug: "racket-pro",
    title: "Racket Pro",
    description: null,
    brand_id: 7,
    status: "active",
    visibility: "public",
    metadata: { publicSpec: "graphite", privateCost: 12000, snake_key: "opaque" },
    version: 3,
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-04T10:00:00Z",
};

export const axes = [
    { id: 10, key: "grip", field_key: null, label: "Grip", position: 0 },
    { id: 11, key: "color", field_key: "finishColor", label: "Color", position: 1 },
];

export const axisValues = [
    { id: 20, axis_id: 10, key: "l1", label: "L1", value: "L1", position: 0 },
    { id: 22, axis_id: 11, key: "red", label: "Red", value: "red", position: 0 },
    { id: 21, axis_id: 10, key: "l2", label: "L2", value: "L2", position: 1 },
    { id: 23, axis_id: 11, key: "blue", label: "Blue", value: "blue", position: 1 },
];

export const variants = [
    {
        id: 100,
        product_id: 42,
        sku: null,
        title: "L1 / Red",
        status: "active",
        position: 0,
        combination_key: "grip:l1|color:red",
        generated_from_axes: true,
        metadata: { publicSpec: "variant", variantSecret: "kept" },
        version: 2,
        created_at: "2026-07-02T10:00:00Z",
        updated_at: "2026-07-03T10:00:00Z",
    },
    {
        id: 101,
        product_id: 42,
        sku: "INCOMPLETE",
        title: "Incomplete",
        status: "archived",
        position: 1,
        combination_key: null,
        generated_from_axes: true,
        metadata: {},
        version: 1,
        created_at: "2026-07-02T11:00:00Z",
        updated_at: "2026-07-02T11:00:00Z",
    },
];

export const selections = [
    { variant_id: 100, axis_id: 11, value_id: 22 },
    { variant_id: 100, axis_id: 10, value_id: 20 },
];

export const media = [
    {
        id: 301,
        media_id: 501,
        sort_order: 1,
        is_main: false,
        media: {
            id: 501,
            storage_bucket: "commerce-media",
            storage_path: "products/42/side.webp",
            mime_type: "image/webp",
            file_size: 1200,
            original_filename: "side.webp",
            alt: null,
            created_at: "2026-07-01T11:00:00Z",
            updated_at: "2026-07-01T11:00:00Z",
        },
    },
    {
        id: 302,
        media_id: 502,
        sort_order: 2,
        is_main: true,
        media: {
            id: 502,
            storage_bucket: "commerce-media",
            storage_path: "products/42/front.webp",
            mime_type: "image/webp",
            file_size: 1400,
            original_filename: "front.webp",
            alt: "Front",
            created_at: "2026-07-01T12:00:00Z",
            updated_at: "2026-07-02T12:00:00Z",
        },
    },
];

export const brand = { id: 7, slug: "acme", name: "Acme", status: "active" };

export const categories = [
    {
        product_id: 42,
        category_id: 9,
        is_primary: true,
        position: 2,
        category: {
            id: 9,
            parent_id: 3,
            slug: "rackets",
            full_slug: "sports/rackets",
            label: "Rackets",
            status: "active",
            position: 2,
        },
    },
    {
        product_id: 42,
        category_id: 12,
        is_primary: false,
        position: 4,
        category: {
            id: 12,
            parent_id: null,
            slug: "featured",
            full_slug: "featured",
            label: "Featured",
            status: "draft",
            position: 4,
        },
    },
];

const mediaProjection = media.map((row) => camelize({ ...row, media: { ...row.media, url: "" } }));
const categoryProjection = categories.map(camelize);
const adminMetadata = productRow.metadata;
const publicMetadata = { publicSpec: "graphite", snake_key: "opaque" };

export const adminProduct = productProjection(adminMetadata);
export const publicProduct = productProjection(publicMetadata);
export const adminSourceProduct = sourceProjection(adminProduct, true);
export const publicSourceProduct = sourceProjection(publicProduct, false);

export const newProduct = {
    id: null,
    slug: "",
    title: "",
    description: "",
    brandId: null,
    primaryCategoryId: null,
    status: "draft",
    visibility: "public",
    metadata: {},
    media: [],
    mainImageMediaId: null,
    variantAxes: [],
    variants: [],
    variantMatrix: [],
    version: 1,
};

function productProjection(metadata: Record<string, unknown>) {
    const currentVariant = camelize(variants[0]!);
    const matrix = [
        {
            ...currentVariant,
            key: "grip:l1|color:red",
            variantId: "100",
            options: "L1 / Red",
            choices: [
                { axisKey: "grip", axisLabel: "Grip", valueKey: "l1", valueLabel: "L1", fieldKey: null, value: "L1" },
                {
                    axisKey: "color",
                    axisLabel: "Color",
                    valueKey: "red",
                    valueLabel: "Red",
                    fieldKey: "finishColor",
                    value: "red",
                },
            ],
            effectiveMetadata: {
                ...metadata,
                publicSpec: "variant",
                variantSecret: "kept",
                finishColor: "red",
            },
        },
    ];
    return {
        ...camelize({ ...productRow, metadata }),
        brand: camelize(brand),
        primaryCategoryId: 9,
        primaryCategory: camelize(categories[0]!.category),
        categories: categoryProjection,
        media: mediaProjection,
        mainImageMediaId: "502",
        variantAxes: [
            { key: "grip", fieldKey: null, label: "Grip", position: 0, values: ["L1", "L2"] },
            { key: "color", fieldKey: "finishColor", label: "Color", position: 1, values: ["Red", "Blue"] },
        ],
        variants: matrix,
        variantMatrix: matrix,
    };
}

function sourceProjection(product: any, admin: boolean): Record<string, unknown> {
    const {
        categories: _categories,
        brandId,
        brand: productBrand,
        primaryCategoryId,
        primaryCategory,
        ...common
    } = product;
    const variantsProjection = product.variants.map((variant: any) => {
        const { metadata: _metadata, effectiveMetadata: _effectiveMetadata, choices, ...fields } = variant;
        return {
            ...fields,
            choices: choices.map(({ fieldKey: _fieldKey, value: _value, ...choice }: any) => choice),
        };
    });
    const projection = {
        ...common,
        variantAxes: product.variantAxes.map((axis: any) => {
            if (admin) {
                return axis;
            }
            const { fieldKey: _fieldKey, ...publicAxis } = axis;
            return publicAxis;
        }),
        variants: variantsProjection,
        variantMatrix: variantsProjection,
    };
    return admin ? { ...projection, brandId, brand: productBrand, primaryCategoryId, primaryCategory } : projection;
}

function camelize(value: unknown): any {
    if (Array.isArray(value)) {
        return value.map(camelize);
    }
    if (!value || typeof value !== "object") {
        return value;
    }
    return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
            key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()),
            key === "metadata" ? entry : camelize(entry),
        ]),
    );
}
