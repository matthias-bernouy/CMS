import { describe, expect, test } from "bun:test";
import {
    IntegrationPackageUploadError,
    integrationPackageUploadErrorResponse,
    readIntegrationPackageUpload,
} from "@bernouy/cms-repository-management";
import { byteBody, canonicalDocument, uploadRequest } from "./fixtures";

describe("integration package upload transport limits", () => {
    test("rejects an oversized Content-Length before acquiring the request stream", async () => {
        let readerAcquisitions = 0;
        const body = {
            getReader() {
                readerAcquisitions += 1;
                throw new Error("body must not be touched");
            },
        } as unknown as ReadableStream<Uint8Array>;
        const request = uploadRequest(body, {
            "content-type": "application/json",
            "content-length": "101",
        });

        await expect(readIntegrationPackageUpload(request, { maxBodyBytes: 100 })).rejects.toMatchObject({
            code: "management_package_upload_too_large",
            status: 413,
        });
        expect(readerAcquisitions).toBe(0);
    });

    test("cancels a chunked body as soon as actual bytes exceed the hard cap", async () => {
        let pulls = 0;
        let cancellations = 0;
        const body = new ReadableStream<Uint8Array>(
            {
                pull(controller) {
                    pulls += 1;
                    controller.enqueue(new Uint8Array(6));
                },
                cancel() {
                    cancellations += 1;
                },
            },
            { highWaterMark: 0 },
        );

        await expect(readIntegrationPackageUpload(uploadRequest(body), { maxBodyBytes: 10 })).rejects.toMatchObject({
            code: "management_package_upload_too_large",
        });
        expect(pulls).toBe(2);
        expect(cancellations).toBe(1);
    });

    test.each([
        ["decoded bytes", { maxDecodedBytes: 16 }],
        ["file count", { maxFiles: 2 }],
        ["directory count", { maxDirectories: 1 }],
    ])("maps the %s package limit to payload too large", async (_label, packageLimits) => {
        const document = canonicalDocument();

        await expect(
            readIntegrationPackageUpload(uploadRequest(byteBody(document)), {
                maxBodyBytes: document.byteLength,
                packageLimits,
            }),
        ).rejects.toMatchObject({
            code: "management_package_upload_too_large",
            status: 413,
        });
    });

    test("maps canonical document and JSON depth limits to payload too large", async () => {
        const document = canonicalDocument();
        await expect(
            readIntegrationPackageUpload(uploadRequest(byteBody(document)), {
                maxBodyBytes: document.byteLength,
                packageLimits: { maxDocumentBytes: document.byteLength - 1 },
            }),
        ).rejects.toMatchObject({ code: "management_package_upload_too_large" });

        const deeplyNested = new TextEncoder().encode(`${"[".repeat(65)}null${"]".repeat(65)}`);
        await expect(
            readIntegrationPackageUpload(uploadRequest(byteBody(deeplyNested)), {
                maxBodyBytes: deeplyNested.byteLength,
            }),
        ).rejects.toMatchObject({ code: "management_package_upload_too_large" });
    });

    test("rejects invalid declared lengths and mismatches as malformed requests", async () => {
        const document = canonicalDocument();
        for (const contentLength of ["-1", "1.5", "01", "9007199254740992"]) {
            await expect(
                readIntegrationPackageUpload(
                    uploadRequest(byteBody(document), {
                        "content-type": "application/json",
                        "content-length": contentLength,
                    }),
                    { maxBodyBytes: document.byteLength + 1 },
                ),
            ).rejects.toMatchObject({ code: "management_package_upload_invalid" });
        }

        await expect(
            readIntegrationPackageUpload(
                uploadRequest(byteBody(document), {
                    "content-type": "application/json",
                    "content-length": String(document.byteLength - 1),
                }),
                { maxBodyBytes: document.byteLength },
            ),
        ).rejects.toMatchObject({ code: "management_package_upload_invalid" });
    });

    test("maps size failures to a stable response without exposing internals", async () => {
        const secret = "private-package-content";
        const error = await rejectedError(
            readIntegrationPackageUpload(uploadRequest(byteBody(new TextEncoder().encode(secret))), {
                maxBodyBytes: secret.length - 1,
            }),
        );
        const response = integrationPackageUploadErrorResponse(error);
        const serialized = await response.text();

        expect(response.status).toBe(413);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(JSON.parse(serialized)).toEqual({
            error: "Integration package upload is too large",
            code: "management_package_upload_too_large",
        });
        expect(serialized).not.toContain(secret);
    });
});

async function rejectedError(promise: Promise<unknown>): Promise<IntegrationPackageUploadError> {
    try {
        await promise;
        throw new Error("Expected upload parsing to reject");
    } catch (error) {
        expect(error).toBeInstanceOf(IntegrationPackageUploadError);
        return error as IntegrationPackageUploadError;
    }
}
