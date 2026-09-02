import { maxFormImageBytes } from "./constants.ts";
import { readSingleMultipartFile } from "./multipart.ts";
import { probeFormImage, type ProbedImage } from "./probe/index.ts";

export type FormImage = ProbedImage & { file: File };

export async function readFormImage(request: Request): Promise<FormImage> {
    const multipart = await readSingleMultipartFile(request, maxFormImageBytes);
    const detected = probeFormImage(multipart.bytes);
    return {
        ...detected,
        file: new File([multipart.bytes], multipart.filename, { type: detected.mimeType }),
    };
}

export function formImagePath(formKey: string, image: FormImage): string {
    const date = new Date().toISOString().slice(0, 10);
    return `forms/${formKey}/${date}/${crypto.randomUUID()}${image.extension}`;
}
