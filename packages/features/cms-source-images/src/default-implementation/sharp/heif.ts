import sharp from "sharp";
import type { SourceImageRecipe } from "../../interfaces/recipe";
import type { SourceImageMetadata, SourceImageTransformResult } from "../../interfaces/transformer";

type DecodedImage = {
    get_width(): number;
    get_height(): number;
    display(
        target: { data: Uint8ClampedArray; width: number; height: number },
        callback: (result: { data: Uint8ClampedArray; width: number; height: number } | null) => void,
    ): void;
};

async function primaryImage(source: Uint8Array, recipe: SourceImageRecipe): Promise<DecodedImage> {
    const { default: libheif } = await import("libheif-js");
    const images = new libheif.HeifDecoder().decode(source);
    const image = images[0] as DecodedImage | undefined;
    const width = image?.get_width();
    const height = image?.get_height();
    if (
        !image ||
        !width ||
        !height ||
        width < 1 ||
        height < 1 ||
        !Number.isSafeInteger(width * height) ||
        width * height > recipe.maxInputPixels
    ) {
        throw new Error("unsupported or invalid HEIF image");
    }
    return image;
}

export async function inspectHeif(source: Uint8Array, recipe: SourceImageRecipe): Promise<SourceImageMetadata> {
    const image = await primaryImage(source, recipe);
    return { format: "heif", width: image.get_width(), height: image.get_height(), pages: 1 };
}

export async function transformHeif(
    source: Uint8Array,
    options: { width: number; recipe: SourceImageRecipe },
): Promise<SourceImageTransformResult> {
    const image = await primaryImage(source, options.recipe);
    const width = image.get_width();
    const height = image.get_height();
    const decoded = await new Promise<{ data: Uint8ClampedArray; width: number; height: number }>((resolve, reject) => {
        image.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, (result) => {
            if (result) {
                resolve(result);
            } else {
                reject(new Error("HEIF image could not be decoded"));
            }
        });
    });
    const pixels = new Uint8Array(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength);
    const { data, info } = await sharp(pixels, { raw: { width, height, channels: 4 } })
        .toColourspace("srgb")
        .resize({ width: options.width, withoutEnlargement: true })
        .webp({ quality: options.recipe.quality })
        .toBuffer({ resolveWithObject: true });
    return { bytes: new Uint8Array(data), width: info.width, height: info.height };
}
