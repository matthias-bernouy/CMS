export const product = {
    id: 21,
    title: "Sample Aero Team 2023 — 285g",
    primaryCategory: { fullSlug: "equipment/rackets", label: "Rackets" },
    metadata: {
        sport: "tennis",
        model_year: 2023,
        weight: 285,
        head_size: 645,
        balance: 320,
        string_pattern: "16x19",
        player_level: "Intermediate",
        play_style: "Spin",
        balance_type: "Head light",
        estimate_floor: 40,
        estimate_ceiling: 100,
        internal_reference: "unlisted field",
        empty_field: null,
        tolerance: 0,
    },
    variants: [{ id: 42, title: "Grip size: L2", choices: [{ axisLabel: "Grip size", valueLabel: "L2" }] }],
};

export const schema = {
    fields: [
        ["sport", "Sport"],
        ["model_year", "Model year"],
        ["weight", "Weight", "g"],
        ["head_size", "Head size", "cm²"],
        ["balance", "Balance", "mm"],
        ["string_pattern", "String pattern"],
        ["player_level", "Player level"],
        ["play_style", "Play style"],
        ["balance_type", "Balance distribution"],
        ["estimate_floor", "Minimum reference value", "EUR"],
        ["estimate_ceiling", "Maximum reference value", "EUR"],
        ["empty_field", "Empty field"],
        ["tolerance", "Tolerance", "g"],
    ].map(([key, label, unit]) => ({ key, label, unit, filterable: false })),
};

export const offer = {
    id: 7,
    productId: product.id,
    variantId: 42,
    slug: "sample-offer",
    title: "Sample used racket",
    availability: "available",
    acceptedPriceAmount: 5000,
    currency: "EUR",
    media: [],
    product: { title: product.title },
    variant: { id: 42, title: "Grip size: L2" },
};
