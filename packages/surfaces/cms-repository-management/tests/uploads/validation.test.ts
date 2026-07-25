import { describe, expect, test } from "bun:test";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    IntegrationPackageUploadError,
    integrationPackageUploadErrorResponse,
    readIntegrationPackageUpload,
} from "@bernouy/cms-repository-management";
import { byteBody, uploadRequest, utf8, validEnvelope } from "./fixtures";

describe("integration package upload parsing", () => {
    test("round-trips a valid JSON body and reports raw and canonical sizes", async () => {
        const envelope = validEnvelope();
        const rawBytes = utf8.encode(JSON.stringify(envelope, null, 2));
        const canonicalBytes = canonicalJsonBytes(envelope);
        const upload = await readIntegrationPackageUpload(
            uploadRequest(byteBody(rawBytes), {
                "content-type": "Application/JSON; charset=utf-8",
                "content-length": String(rawBytes.byteLength),
            }),
            { maxBodyBytes: rawBytes.byteLength },
        );

        expect(upload.envelope).toEqual(envelope);
        expect(upload.rawByteLength).toBe(rawBytes.byteLength);
        expect(upload.canonicalByteLength).toBe(canonicalBytes.byteLength);
        expect(upload.canonicalBytes).toEqual(canonicalBytes);
        expect(upload.rawByteLength).toBeGreaterThan(upload.canonicalByteLength);
    });

    test.each([
        ["invalid UTF-8", Uint8Array.of(0x7b, 0xff, 0x7d)],
        ["malformed JSON", utf8.encode('{"private":"body-secret"')],
        ["empty JSON", new Uint8Array()],
    ])("rejects %s with a sanitized typed error", async (_label, bytes) => {
        const error = await rejectedError(
            readIntegrationPackageUpload(uploadRequest(byteBody(bytes)), {
                maxBodyBytes: Math.max(1, bytes.byteLength),
            }),
        );
        const response = integrationPackageUploadErrorResponse(error);
        const serialized = await response.text();

        expect(error.code).toBe("management_package_upload_invalid");
        expect(response.status).toBe(400);
        expect(JSON.parse(serialized)).toEqual({
            error: "Integration package upload is invalid",
            code: "management_package_upload_invalid",
        });
        expect(serialized).not.toContain("body-secret");
        const rawBody = new TextDecoder().decode(bytes);
        if (rawBody) {
            expect(serialized).not.toContain(rawBody);
        }
    });

    test("rejects duplicate decoded properties through the shared strict parser", async () => {
        const source = JSON.stringify(validEnvelope()).replace(
            '"kind":"demo"',
            '"kind":"demo","\\u006bind":"body-secret"',
        );
        const error = await rejectedError(
            readIntegrationPackageUpload(uploadRequest(byteBody(utf8.encode(source))), {
                maxBodyBytes: utf8.encode(source).byteLength,
            }),
        );

        expect(error.code).toBe("management_package_upload_invalid");
        expect(error.message).not.toContain("body-secret");
        expect(await integrationPackageUploadErrorResponse(error).text()).not.toContain("body-secret");
    });

    test("rejects missing bodies, unsupported media types, and compression before parsing", async () => {
        await expect(readIntegrationPackageUpload(uploadRequest(null), { maxBodyBytes: 100 })).rejects.toMatchObject({
            code: "management_package_upload_invalid",
            status: 400,
        });

        for (const headers of [
            {},
            { "content-type": "text/plain" },
            { "content-type": "application/problem+json" },
            { "content-type": "application/json", "content-encoding": "gzip" },
        ]) {
            let readerAcquisitions = 0;
            const body = {
                getReader() {
                    readerAcquisitions += 1;
                    throw new Error("unsupported body must not be touched");
                },
            } as unknown as ReadableStream<Uint8Array>;

            await expect(
                readIntegrationPackageUpload(uploadRequest(body, headers), { maxBodyBytes: 100 }),
            ).rejects.toMatchObject({ code: "management_package_upload_invalid" });
            expect(readerAcquisitions).toBe(0);
        }
    });

    test("requires release notes for normal management publications", async () => {
        const envelope = validEnvelope();
        delete envelope.releaseNotes;
        delete envelope.files["release-notes.md"];
        const source = canonicalJsonBytes(envelope);

        await expect(
            readIntegrationPackageUpload(uploadRequest(byteBody(source)), { maxBodyBytes: source.byteLength }),
        ).rejects.toMatchObject({ code: "management_package_upload_invalid" });
    });

    test("rejects invalid composition limits before acquiring a body reader", async () => {
        const body = {
            getReader() {
                throw new Error("body must not be touched");
            },
        } as unknown as ReadableStream<Uint8Array>;

        for (const maxBodyBytes of [0, -1, 1.5, Number.NaN]) {
            await expect(readIntegrationPackageUpload(uploadRequest(body), { maxBodyBytes })).rejects.toBeInstanceOf(
                TypeError,
            );
        }
        await expect(
            readIntegrationPackageUpload(uploadRequest(body), {
                maxBodyBytes: 100,
                packageLimits: { maxDecodedBytes: 0 },
            }),
        ).rejects.toBeInstanceOf(TypeError);
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
