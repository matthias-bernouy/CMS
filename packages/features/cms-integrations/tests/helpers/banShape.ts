import type { DataShape } from "@bernouy/cms-sources";

export const FEATURE_COLLECTION: DataShape = {
    type: "object",
    properties: {
        type: { type: "string" },
        features: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    type: { type: "string" },
                    geometry: {
                        type: "object",
                        properties: {
                            type: { type: "string" },
                            coordinates: { type: "array", items: { type: "number" } },
                        },
                    },
                    properties: {
                        type: "object",
                        properties: {
                            label: { type: "string" },
                            score: { type: "number" },
                            type: { type: "string" },
                            name: { type: "string" },
                            postcode: { type: "string" },
                            citycode: { type: "string" },
                            city: { type: "string" },
                            context: { type: "string" },
                            x: { type: "number" },
                            y: { type: "number" },
                        },
                    },
                },
            },
        },
    },
};
