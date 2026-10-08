const invalidImageMessage = "file is not a valid supported image";
const maximumJpegBytes = 5 * 1024 * 1024;
const maximumDimensions = [4096, 3072, 2560, 2048];
const jpegQualities = [0.9, 0.82, 0.72, 0.62];

type Upload = (file: File) => Promise<unknown>;
type Convert = (file: File) => Promise<File>;

export async function uploadPhotoWithJpegFallback(
    file: File,
    upload: Upload,
    convert: Convert = convertPhotoToJpeg,
): Promise<void> {
    try {
        await upload(file);
        return;
    } catch (error) {
        if (!isUnsupportedImageError(error)) {
            throw error;
        }
    }

    await upload(await convert(file));
}

export async function convertPhotoToJpeg(file: File): Promise<File> {
    const objectUrl = URL.createObjectURL(file);
    try {
        const image = await loadImage(objectUrl);
        const sizes = maximumDimensions
            .map((maximumDimension) => constrainedSize(image.naturalWidth, image.naturalHeight, maximumDimension))
            .filter(
                (size, index, all) =>
                    all.findIndex((candidate) => candidate.width === size.width && candidate.height === size.height) ===
                    index,
            );

        const canvas = document.createElement("canvas");
        let smallestBlob: Blob | null = null;
        for (const size of sizes) {
            canvas.width = size.width;
            canvas.height = size.height;
            const context = canvas.getContext("2d");
            if (!context) {
                throw new Error("The photo could not be converted to JPEG.");
            }
            context.fillStyle = "white";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);

            for (const quality of jpegQualities) {
                const blob = await canvasToJpeg(canvas, quality);
                smallestBlob = !smallestBlob || blob.size < smallestBlob.size ? blob : smallestBlob;
                if (blob.size <= maximumJpegBytes) {
                    return jpegFile(blob, file);
                }
            }
        }

        if (smallestBlob) {
            throw new Error("The converted photo is larger than 5 MB.");
        }
        throw new Error("The photo could not be converted to JPEG.");
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

function isUnsupportedImageError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }
    const candidate = error as { message?: unknown; status?: unknown };
    return (
        candidate.status === 400 &&
        typeof candidate.message === "string" &&
        candidate.message.toLowerCase().includes(invalidImageMessage)
    );
}

function loadImage(source: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("The photo could not be decoded by this browser."));
        image.src = source;
    });
}

function constrainedSize(width: number, height: number, maximumDimension: number) {
    const scale = Math.min(1, maximumDimension / Math.max(width, height));
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error("The photo could not be encoded as JPEG."));
                }
            },
            "image/jpeg",
            quality,
        );
    });
}

function jpegFile(blob: Blob, source: File): File {
    const baseName = source.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.jpg`, {
        type: "image/jpeg",
        lastModified: source.lastModified,
    });
}
