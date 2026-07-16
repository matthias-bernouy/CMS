export function publicOfferListReadModel(): Record<string, unknown> {
    const bladeMetadata = { brand: "Wilson", sport: "tennis", weight: 305, grip: "L1" };
    const speedMetadata = { brand: "Head", sport: "tennis", grip: "L3", weight: 300 };
    return {
        settings_available: true,
        items: [{
            id: 1,
            product_id: 41,
            variant_id: 51,
            slug: "blade",
            title: "Blade",
            publication_status: "active",
            accepted_price_amount: 15000,
            metadata: {},
            product: {
                id: 41,
                title: "Blade",
                metadata: bladeMetadata,
                brand: null,
                primary_category_id: 8,
                primary_category: { id: 8, full_slug: "rackets/tennis", label: "Tennis" },
                effective_metadata: bladeMetadata,
            },
            variant: {
                id: 51,
                product_id: 41,
                title: "Grip: L1",
                metadata: {},
                effective_metadata: bladeMetadata,
            },
            media: [],
            main_image_media_id: null,
        }, {
            id: 2,
            product_id: 42,
            slug: "speed",
            title: "Speed",
            publication_status: "active",
            accepted_price_amount: 17500,
            metadata: {},
            product: {
                id: 42,
                title: "Speed",
                metadata: speedMetadata,
                brand: null,
                primary_category_id: null,
                primary_category: null,
                effective_metadata: speedMetadata,
            },
            variant: null,
            media: [],
            main_image_media_id: null,
        }],
        total: 2,
    };
}

export function publicOfferDetailReadModel(): Record<string, unknown> {
    return {
        candidate_exists: true,
        settings_available: true,
        offer: {
            id: 91,
            product_id: 42,
            variant_id: null,
            slug: "camera-offer",
            publication_status: "active",
            metadata: {},
            product: {
                id: 42,
                slug: "camera",
                title: "Camera",
                status: "active",
                visibility: "public",
                metadata: { brand: "Canon" },
                brand: null,
                primary_category_id: null,
                primary_category: null,
            },
            variant: null,
            price_rule: null,
            price_proposals: [],
            media: [{
                id: 8,
                media_id: 12,
                sort_order: 0,
                is_main: true,
                media: {
                    id: 12,
                    storage_bucket: "commerce-media",
                    storage_path: "offers/91/photo.jpg",
                    alt: "Front",
                    url: "",
                },
            }],
            main_image_media_id: "12",
        },
    };
}
