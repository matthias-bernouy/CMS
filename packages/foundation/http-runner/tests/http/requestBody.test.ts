import { describe, expect, test } from "bun:test";
import { readBoundedFormData, readBoundedRequestBody, RequestBodyTooLargeError } from "@bernouy/http-runner";

describe("bounded request bodies", () => {
    test("rejects a declared oversized body before consuming its stream", async () => {
        const body = new ReadableStream<Uint8Array>({
            pull(controller) {
                controller.enqueue(new Uint8Array([1]));
                controller.close();
            },
        });
        const request = new Request("https://example.test", {
            method: "POST",
            headers: { "Content-Length": "11" },
            body,
            duplex: "half",
        });

        await expect(readBoundedRequestBody(request, 10)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
        expect(new Uint8Array(await request.arrayBuffer())).toEqual(new Uint8Array([1]));
    });

    test("rejects a chunked body as soon as it crosses the allocation limit", async () => {
        const request = new Request("https://example.test", {
            method: "POST",
            body: new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new Uint8Array(6));
                    controller.enqueue(new Uint8Array(5));
                    controller.close();
                },
            }),
            duplex: "half",
        });

        await expect(readBoundedRequestBody(request, 10)).rejects.toMatchObject({
            status: 413,
            publicCode: "request_body_too_large",
        });
    });

    test("parses multipart data only after the complete envelope passes the bound", async () => {
        const source = new FormData();
        source.set("name", "Ada");
        const request = new Request("https://example.test", { method: "POST", body: source });
        const declared = Number(request.headers.get("content-length")) || 1024;

        const parsed = await readBoundedFormData(request, declared + 1024);

        expect(parsed.get("name")).toBe("Ada");
    });
});
