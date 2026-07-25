import { HttpError } from "../../core/errors.ts";
import { maxPhotoPixels } from "../constants.ts";
import { avifDimensions, isAvif } from "./avif.ts";
import { gifDimensions, isGif } from "./gif.ts";
import { isJpeg, jpegDimensions } from "./jpeg.ts";
import { isPng, pngDimensions } from "./png.ts";
import type { ImageDimensions, ProbedImage } from "./types.ts";
import { isWebp, webpDimensions } from "./webp.ts";

export type { ImageDimensions, ProbedImage } from "./types.ts";

export function probePhoto(bytes: Uint8Array): ProbedImage {
    const image = detectedImage(bytes);
    validateDimensions(image);
    return image;
}

function detectedImage(bytes: Uint8Array): ProbedImage {
    if (isJpeg(bytes)) {
        return { ...jpegDimensions(bytes), mimeType: "image/jpeg", extension: ".jpg" };
    }
    if (isPng(bytes)) {
        return { ...pngDimensions(bytes), mimeType: "image/png", extension: ".png" };
    }
    if (isWebp(bytes)) {
        return { ...webpDimensions(bytes), mimeType: "image/webp", extension: ".webp" };
    }
    if (isGif(bytes)) {
        return { ...gifDimensions(bytes), mimeType: "image/gif", extension: ".gif" };
    }
    if (isAvif(bytes)) {
        return { ...avifDimensions(bytes), mimeType: "image/avif", extension: ".avif" };
    }
    throw new HttpError(400, "file must be a JPEG, PNG, WebP, GIF, or AVIF image");
}

function validateDimensions(dimensions: ImageDimensions): void {
    const { width, height } = dimensions;
    if (
        !Number.isSafeInteger(width) ||
        !Number.isSafeInteger(height) ||
        width <= 0 ||
        height <= 0 ||
        width * height > maxPhotoPixels
    ) {
        throw new HttpError(400, "image dimensions are invalid or too large");
    }
}
