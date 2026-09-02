import { describe, expect, test } from "bun:test";
import {
    maxMultipartOverheadBytes,
    maxProductImageBytes,
} from "../../../connectors/supabase/functions/cms-commerce/routes/catalog/media/constants";
import { readCommerceImage } from "../../../connectors/supabase/functions/cms-commerce/routes/catalog/media/request";
import { imageForm, pngBytes, rawMultipart } from "./fixtures";

describe("Commerce bounded multipart image reader", () => {
    test("uses detected bytes, dimensions, MIME, extension, and a basename", async () => {
        const request = new Request("https://example.test/upload", {
            method: "POST",
            body: imageForm(pngBytes(640, 360), {
                filename: "folder/racket.jpg",
                type: "image/jpeg",
            }),
        });

        const image = await readCommerceImage(request);

        expect(image).toMatchObject({
            width: 640,
            height: 360,
            mimeType: "image/png",
            extension: ".png",
        });
        expect(image.file).toMatchObject({
            name: "racket.jpg",
            type: "image/png",
            size: pngBytes(640, 360).byteLength,
        });
    });

    test("requires exactly one file part", async () => {
        const missing = new Request("https://example.test/upload", {
            method: "POST",
            body: new FormData(),
        });
        const duplicate = new Request("https://example.test/upload", {
            method: "POST",
            body: imageForm(pngBytes(), { secondFile: true }),
        });

        await expect(readCommerceImage(missing)).rejects.toMatchObject({ status: 400, message: "file is required" });
        await expect(readCommerceImage(duplicate)).rejects.toMatchObject({
            status: 400,
            message: "exactly one file is required",
        });
    });

    test("does not let absent or dishonest Content-Length bypass the file bound", async () => {
        const oversized = new Uint8Array(maxProductImageBytes + 1);
        oversized.set(pngBytes());
        const multipart = rawMultipart(oversized);
        const absent = bodyRequest(multipart.body, multipart.contentType);
        const dishonest = bodyRequest(multipart.body, multipart.contentType, "128");

        await expect(readCommerceImage(absent)).rejects.toMatchObject({ status: 413 });
        await expect(readCommerceImage(dishonest)).rejects.toMatchObject({ status: 413 });
    });

    test("uses Content-Length only as a zero-read fast rejection", async () => {
        let pulls = 0;
        const body = new ReadableStream<Uint8Array>({
            pull(controller) {
                pulls++;
                controller.enqueue(pngBytes());
            },
        });
        const request = streamRequest(body, "multipart/form-data; boundary=x", String(Number.MAX_SAFE_INTEGER));

        await expect(readCommerceImage(request)).rejects.toMatchObject({ status: 413 });
        expect(pulls).toBe(0);
    });

    test("cancels the body stream as soon as the real body bound is exceeded", async () => {
        let cancelled = false;
        let sent = false;
        const body = new ReadableStream<Uint8Array>({
            pull(controller) {
                if (!sent) {
                    sent = true;
                    controller.enqueue(new Uint8Array(maxProductImageBytes + maxMultipartOverheadBytes + 1));
                }
            },
            cancel() {
                cancelled = true;
            },
        });
        const request = streamRequest(body, "multipart/form-data; boundary=x");

        await expect(readCommerceImage(request)).rejects.toMatchObject({ status: 413 });
        expect(cancelled).toBeTrue();
    });

    test("rejects malformed multipart framing and non-multipart requests", async () => {
        const malformed = new Request("https://example.test/upload", {
            method: "POST",
            headers: { "content-type": "multipart/form-data; boundary=missing" },
            body: pngBytes(),
        });
        const json = new Request("https://example.test/upload", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
        });

        await expect(readCommerceImage(malformed)).rejects.toMatchObject({ status: 400 });
        await expect(readCommerceImage(json)).rejects.toMatchObject({
            status: 400,
            message: "image upload must use multipart/form-data",
        });
    });
});

function bodyRequest(body: Uint8Array, contentType: string, contentLength?: string): Request {
    return new Request("https://example.test/upload", {
        method: "POST",
        headers: {
            "content-type": contentType,
            ...(contentLength ? { "content-length": contentLength } : {}),
        },
        body,
    });
}

function streamRequest(body: ReadableStream<Uint8Array>, contentType: string, contentLength?: string): Request {
    return new Request("https://example.test/upload", {
        method: "POST",
        headers: {
            "content-type": contentType,
            ...(contentLength ? { "content-length": contentLength } : {}),
        },
        body,
        duplex: "half",
    } as RequestInit & { duplex: "half" });
}
