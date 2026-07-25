import type { SourceImageInputFormat, SourceImageMetadata } from "../../interfaces/transformer";

export function validateSourceImageResponse(response: Response, bytes: Uint8Array): SourceImageInputFormat {
    const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    const expected = mediaType === "image/jpg" ? "jpeg" : mediaType?.slice("image/".length);
    const detected = detectImageFormat(bytes);
    if (!expected || !detected || expected !== detected) {
        throw new SourceImageFailure("upstream_content_type", "source response is not a supported raster image");
    }
    return detected;
}

export function validateDecodedImage(
    metadata: SourceImageMetadata,
    detected: SourceImageInputFormat,
    maxPixels: number,
): void {
    if (metadata.format !== detected || metadata.width < 1 || metadata.height < 1) {
        throw new SourceImageFailure("invalid_image", "source image metadata is invalid");
    }
    if (metadata.width * metadata.height > maxPixels) {
        throw new SourceImageFailure("pixel_limit", "source image exceeds the decoded-pixel limit");
    }
    if (metadata.pages > 1) {
        throw new SourceImageFailure("animated_image", "animated source images are not transformed");
    }
}

export class SourceImageFailure extends Error {
    constructor(
        readonly reason:
            | "source_too_large"
            | "read_timeout"
            | "upstream_content_type"
            | "invalid_image"
            | "animated_image"
            | "pixel_limit",
        message: string,
    ) {
        super(message);
        this.name = "SourceImageFailure";
    }
}

function detectImageFormat(bytes: Uint8Array): SourceImageInputFormat | null {
    if (matches(bytes, [0xff, 0xd8, 0xff])) {
        return "jpeg";
    }
    if (matches(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
        return "png";
    }
    if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
        return "webp";
    }
    const gif = ascii(bytes, 0, 6);
    if (gif === "GIF87a" || gif === "GIF89a") {
        return "gif";
    }
    if (ascii(bytes, 4, 4) === "ftyp") {
        const brands = [ascii(bytes, 8, 4), ascii(bytes, 16, 4), ascii(bytes, 20, 4)];
        if (brands.some((brand) => brand === "avif" || brand === "avis")) {
            return "avif";
        }
    }
    return null;
}

function matches(bytes: Uint8Array, signature: readonly number[]): boolean {
    return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
    if (bytes.byteLength < offset + length) {
        return "";
    }
    return String.fromCharCode(...bytes.subarray(offset, offset + length));
}
