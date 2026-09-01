import { describe, expect, test } from "bun:test";
import type { FormDefinition } from "../blocs/form-renderer/definition";
import { imageChoiceItems } from "../blocs/form-renderer/rendering/imageChoice";

describe("Forms image choices", () => {
    test("prepares image cards from stable keys and safe image sources", () => {
        const field = imageChoiceDefinition().steps[0]!.fields[0]!;

        expect(imageChoiceItems(field, "bright")).toEqual([
            {
                key: "warm",
                label: "Warm",
                imageUrl: "/media/warm.webp",
                imageAlt: "Warm dining room",
                selected: false,
            },
            {
                key: "bright",
                label: "Bright",
                imageUrl: "https://images.example.test/bright.webp",
                imageAlt: "",
                selected: true,
            },
        ]);
    });
});

function imageChoiceDefinition(): FormDefinition {
    return {
        schemaVersion: 1,
        title: "Image choices",
        steps: [
            {
                id: "style",
                title: "Choose a style",
                fields: [
                    {
                        key: "mood",
                        type: "choice",
                        presentation: "image-grid",
                        label: "Visual direction",
                        required: true,
                        options: [
                            {
                                key: "warm",
                                label: "Warm",
                                imageUrl: "/media/warm.webp",
                                imageAlt: "Warm dining room",
                            },
                            {
                                key: "bright",
                                label: "Bright",
                                imageUrl: "https://images.example.test/bright.webp",
                            },
                        ],
                    },
                ],
            },
        ],
    };
}
