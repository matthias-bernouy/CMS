export {
    animatedAvifBytes,
    animatedGifBytes,
    animatedPngBytes,
    animatedWebpBytes,
    avifBytes,
    gifBytes,
    jpegBytes,
    orientedAvifBytes,
    orientedPngBytes,
    orientedWebpBytes,
    pngBytes,
    pngWithAncillaryBytes,
    webpBytes,
} from "./encodedImages";

const encoder = new TextEncoder();

export function imageForm(
    bytes: Uint8Array,
    options: { filename?: string; type?: string; secondFile?: boolean } = {},
): FormData {
    const form = new FormData();
    form.append(
        "file",
        new File([bytes], options.filename ?? "image.bin", {
            type: options.type ?? "application/octet-stream",
        }),
    );
    if (options.secondFile) {
        form.append("file", new File([bytes], "second.bin"));
    }
    return form;
}

export function rawMultipart(
    bytes: Uint8Array,
    options: { boundary?: string; filename?: string; type?: string; secondFile?: Uint8Array } = {},
): { body: Uint8Array; contentType: string } {
    const boundary = options.boundary ?? "commerce-image-boundary";
    const parts = [
        filePart(boundary, bytes, options.filename ?? "image.bin", options.type ?? "application/octet-stream"),
    ];
    if (options.secondFile) {
        parts.push(filePart(boundary, options.secondFile, "second.bin", "application/octet-stream"));
    }
    parts.push(encoder.encode(`--${boundary}--\r\n`));
    return { body: concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

function filePart(boundary: string, bytes: Uint8Array, filename: string, type: string): Uint8Array {
    return concat([
        encoder.encode(
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`,
        ),
        bytes,
        encoder.encode("\r\n"),
    ]);
}

function concat(values: Uint8Array[]): Uint8Array {
    const result = new Uint8Array(values.reduce((total, value) => total + value.length, 0));
    let offset = 0;
    for (const value of values) {
        result.set(value, offset);
        offset += value.length;
    }
    return result;
}
