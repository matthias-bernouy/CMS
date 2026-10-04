export type DetectedMedia = Readonly<{ label: string; acceptedMediaTypes: readonly string[] }>;

const MP4_BRANDS = new Set(["avc1", "dash", "iso2", "iso5", "iso6", "isom", "m4a ", "m4v ", "mp41", "mp42"]);

export function detectMediaSignature(bytes: Uint8Array): DetectedMedia | null {
    if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
        return exact("image/png");
    }
    if (starts(bytes, [0xff, 0xd8, 0xff])) {
        return exact("image/jpeg");
    }
    const header = ascii(bytes, 0, 12);
    if (header.startsWith("GIF87a") || header.startsWith("GIF89a")) {
        return exact("image/gif");
    }
    if (header.startsWith("RIFF") && header.slice(8, 12) === "WEBP") {
        return exact("image/webp");
    }
    if (header.startsWith("RIFF") && header.slice(8, 12) === "WAVE") {
        return exact("audio/wav");
    }
    if (starts(bytes, [0x42, 0x4d])) {
        return exact("image/bmp");
    }
    if (starts(bytes, [0x00, 0x00, 0x01, 0x00])) {
        return detected("image/x-icon", ["image/x-icon", "image/vnd.microsoft.icon"]);
    }
    if (header.startsWith("%PDF-")) {
        return exact("application/pdf");
    }
    if (header.startsWith("wOFF")) {
        return exact("font/woff");
    }
    if (header.startsWith("wOF2")) {
        return exact("font/woff2");
    }
    if (header.startsWith("OTTO")) {
        return exact("font/otf");
    }
    if (starts(bytes, [0x00, 0x01, 0x00, 0x00]) || header.startsWith("true")) {
        return exact("font/ttf");
    }
    if (header.startsWith("OggS")) {
        return detected("Ogg", ["audio/ogg"]);
    }
    if (header.startsWith("ID3") || (bytes[0] === 0xff && bytes[1] !== undefined && (bytes[1] & 0xe0) === 0xe0)) {
        return exact("audio/mpeg");
    }
    if (starts(bytes, [0x1f, 0x8b])) {
        return exact("application/gzip");
    }
    if (
        starts(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
        starts(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
        starts(bytes, [0x50, 0x4b, 0x07, 0x08])
    ) {
        return exact("application/zip");
    }
    if (starts(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
        return detected("WebM", ["audio/webm", "video/webm"]);
    }
    if (ascii(bytes, 4, 4) === "ftyp") {
        return detectIsoBaseMedia(bytes);
    }
    if (isSvgLike(bytes)) {
        return exact("image/svg+xml");
    }
    return null;
}

function detectIsoBaseMedia(bytes: Uint8Array): DetectedMedia {
    const brands = [ascii(bytes, 8, 4)];
    for (let offset = 16; offset + 4 <= Math.min(bytes.length, 48); offset += 4) {
        brands.push(ascii(bytes, offset, 4));
    }
    if (brands.some((brand) => brand === "avif" || brand === "avis")) {
        return exact("image/avif");
    }
    if (brands.some((brand) => MP4_BRANDS.has(brand.toLowerCase()))) {
        return detected("ISO base media (MP4)", ["application/mp4", "audio/mp4", "video/mp4"]);
    }
    return detected(`unsupported ISO base media (${brands[0] || "unknown"})`, []);
}

function detected(label: string, acceptedMediaTypes: readonly string[]): DetectedMedia {
    return { label, acceptedMediaTypes };
}

function exact(mediaType: string): DetectedMedia {
    return detected(mediaType, [mediaType]);
}

function starts(bytes: Uint8Array, prefix: readonly number[]): boolean {
    return prefix.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
    return String.fromCharCode(...bytes.slice(offset, offset + length));
}

export function decodeUtf8(bytes: Uint8Array): string | null {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
        return null;
    }
}

export function isSvgLike(bytes: Uint8Array): boolean {
    const text = decodeUtf8(bytes);
    return Boolean(
        text?.match(
            /^\uFEFF?\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE\s+svg[^>]*>\s*)?<svg(?:\s|>)/iu,
        ),
    );
}
