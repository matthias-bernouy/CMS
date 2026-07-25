import { SOURCE_IMAGE_WIDTHS, type SourceImageRecipe, type SourceImageWidth } from "../interfaces/recipe";

export const SOURCE_RESPONSIVE_WEBP_V1: SourceImageRecipe = Object.freeze({
    id: "source-responsive-webp-v1",
    widths: SOURCE_IMAGE_WIDTHS,
    format: "webp",
    quality: 75,
    maxSourceBytes: 10 * 1024 * 1024,
    maxInputPixels: 40_000_000,
    processingTimeoutMs: 10_000,
    animatedInput: "reject",
});

export function immutableSourceImageRecipe(recipe: SourceImageRecipe): SourceImageRecipe {
    if (Object.isFrozen(recipe) && Object.isFrozen(recipe.widths)) {
        return recipe;
    }
    return Object.freeze({
        ...recipe,
        widths: Object.freeze([...recipe.widths]),
    });
}

export function isSourceImageWidth(
    value: number,
    recipe: SourceImageRecipe = SOURCE_RESPONSIVE_WEBP_V1,
): value is SourceImageWidth {
    return recipe.widths.includes(value as SourceImageWidth);
}
