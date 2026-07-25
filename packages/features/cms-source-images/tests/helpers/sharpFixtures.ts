import sharp from "sharp";

export async function solidImage(
    format: "jpeg" | "png" | "webp" | "avif",
    width = 96,
    height = 64,
): Promise<Uint8Array> {
    const pipeline = sharp({
        create: {
            width,
            height,
            channels: 4,
            background: { r: 190, g: 70, b: 20, alpha: 0.8 },
        },
    });
    const encoded =
        format === "jpeg"
            ? pipeline.jpeg()
            : format === "png"
              ? pipeline.png()
              : format === "webp"
                ? pipeline.webp()
                : pipeline.avif();
    return new Uint8Array(await encoded.toBuffer());
}

export async function orientedJpeg(): Promise<Uint8Array> {
    return new Uint8Array(
        await sharp({
            create: {
                width: 80,
                height: 40,
                channels: 3,
                background: { r: 20, g: 100, b: 200 },
            },
        })
            .jpeg()
            .withMetadata({ orientation: 6 })
            .toBuffer(),
    );
}

export const ANIMATED_GIF = Uint8Array.from(
    Buffer.from(
        "R0lGODlhAgACAIEAAAAAAP///wAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQJCgAAACwAAAAAAgACAAAIBgABCAQQEAAh+QQJCgAAACwAAAAAAgACAIH/AAAA/wAAAAAACAQAAQgEEAA7",
        "base64",
    ),
);
