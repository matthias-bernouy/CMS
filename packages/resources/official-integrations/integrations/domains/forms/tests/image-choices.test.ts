import { describe, expect, test } from "bun:test";
import type { FormDefinition } from "../../../collections/ulvia/blocs/domains/forms/form-renderer/definition";
import { imageChoiceItems } from "../../../collections/ulvia/blocs/domains/forms/form-renderer/rendering/imageChoice";

describe("Forms image choices", () => {
    test("prepares image cards from stable keys and safe image sources", () => {
        const field = imageChoiceDefinition().steps[0]!.fields[0]!;

        const source = (mediaId: string) => `/.cms/sources/forms/formImagePublic?id=${mediaId}`;
        expect(imageChoiceItems(field, "bright", source)).toEqual([
            {
                key: "warm",
                label: "Warm",
                imageUrl: "/.cms/sources/forms/formImagePublic?id=17",
                imageAlt: "Warm dining room",
                selected: false,
            },
            {
                key: "bright",
                label: "Bright",
                imageUrl: "/.cms/sources/forms/formImagePublic?id=18",
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
                                image: { mediaId: "17", alt: "Warm dining room" },
                            },
                            {
                                key: "bright",
                                label: "Bright",
                                image: { mediaId: "18" },
                            },
                        ],
                    },
                ],
            },
        ],
    };
}
