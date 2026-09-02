import { describe, expect, test } from "bun:test";
import { handleCommerceRequest } from "../../../../connectors/supabase/functions/cms-commerce/handler";
import {
    capturedFetches,
    commerceApiKey,
    installCommerceTestEnvironment,
    jsonResponse,
    setRestResponder,
} from "../../../harness";
import { pngBytes } from "../fixtures";
import { callKind } from "./uploadHarness";

installCommerceTestEnvironment();

const preauthorizationCases = [
    {
        label: "offer",
        url: "https://cms.example.test/functions/v1/cms-commerce/me/offer/image/replace?offerId=42&mediaId=17",
        headers: {
            authorization: `Bearer ${commerceApiKey}`,
            "x-cms-user-id": "seller-7",
        },
        ownerKey: "offer_id",
        ownerId: 42,
        rpc: "authorize_offer_media_upload",
    },
    {
        label: "product",
        url: "https://cms.example.test/functions/v1/cms-commerce/admin/product/image/replace?productId=9&mediaId=17",
        headers: { authorization: `Bearer ${commerceApiKey}` },
        ownerKey: "product_id",
        ownerId: 9,
        rpc: "authorize_product_media_upload",
    },
] as const;

describe("Commerce image upload authorization", () => {
    test("refused offer ownership reads zero file bytes and writes zero Storage bytes", async () => {
        let bodyAccesses = 0;
        setRestResponder(() => jsonResponse({ message: "not_found: offer" }, 400));
        const request = unreadBodyRequest(
            "https://cms.example.test/functions/v1/cms-commerce/me/offer/image?offerId=42",
            {
                authorization: `Bearer ${commerceApiKey}`,
                "x-cms-user-id": "seller-7",
            },
            () => {
                bodyAccesses++;
            },
        );

        const response = await handleCommerceRequest(request);

        expect(response.status).toBe(404);
        expect(bodyAccesses).toBe(0);
        expect(capturedFetches().map(callKind)).toEqual(["authorize_offer_media_upload"]);
    });

    test("refused product target reads zero file bytes and writes zero Storage bytes", async () => {
        let bodyAccesses = 0;
        setRestResponder(() => jsonResponse({ message: "not_found: product" }, 400));
        const request = unreadBodyRequest(
            "https://cms.example.test/functions/v1/cms-commerce/admin/product/image?productId=9",
            { authorization: `Bearer ${commerceApiKey}` },
            () => {
                bodyAccesses++;
            },
        );

        const response = await handleCommerceRequest(request);

        expect(response.status).toBe(404);
        expect(bodyAccesses).toBe(0);
        expect(capturedFetches().map(callKind)).toEqual(["authorize_product_media_upload"]);
    });

    test.each(preauthorizationCases)(
        "fails closed before reading $label bytes when preauthorization is not explicitly authorized",
        async (scenario) => {
            let bodyAccesses = 0;
            setRestResponder(() =>
                jsonResponse({
                    state: "not_found",
                    [scenario.ownerKey]: scenario.ownerId,
                    replace_media_id: 17,
                }),
            );
            const request = unreadBodyRequest(scenario.url, { ...scenario.headers }, () => {
                bodyAccesses++;
            });

            const response = await handleCommerceRequest(request);

            expect(response.status).toBe(502);
            expect(bodyAccesses).toBe(0);
            expect(capturedFetches().map(callKind)).toEqual([scenario.rpc]);
        },
    );

    test.each(preauthorizationCases)(
        "fails closed before reading $label bytes when replacement identity mismatches",
        async (scenario) => {
            let bodyAccesses = 0;
            setRestResponder(() =>
                jsonResponse({
                    state: "authorized",
                    [scenario.ownerKey]: scenario.ownerId,
                    replace_media_id: 99,
                }),
            );
            const request = unreadBodyRequest(scenario.url, { ...scenario.headers }, () => {
                bodyAccesses++;
            });

            const response = await handleCommerceRequest(request);

            expect(response.status).toBe(502);
            expect(bodyAccesses).toBe(0);
            expect(capturedFetches().map(callKind)).toEqual([scenario.rpc]);
        },
    );

    test.each(preauthorizationCases)(
        "fails closed before reading $label bytes when owner identity mismatches",
        async (scenario) => {
            let bodyAccesses = 0;
            setRestResponder(() =>
                jsonResponse({
                    state: "authorized",
                    [scenario.ownerKey]: scenario.ownerId + 1,
                    replace_media_id: 17,
                }),
            );
            const request = unreadBodyRequest(scenario.url, { ...scenario.headers }, () => {
                bodyAccesses++;
            });

            const response = await handleCommerceRequest(request);

            expect(response.status).toBe(502);
            expect(bodyAccesses).toBe(0);
            expect(capturedFetches().map(callKind)).toEqual([scenario.rpc]);
        },
    );
});

function unreadBodyRequest(url: string, headers: Record<string, string>, onAccess: () => void): Request {
    const body = new ReadableStream<Uint8Array>({
        pull(controller) {
            controller.enqueue(pngBytes());
        },
    });
    const request = new Request(url, {
        method: "POST",
        headers: {
            ...headers,
            "content-type": "multipart/form-data; boundary=not-consumed",
        },
        body,
        duplex: "half",
    } as RequestInit & { duplex: "half" });
    const requestBody = request.body;
    Object.defineProperty(request, "body", {
        configurable: true,
        get() {
            onAccess();
            return requestBody;
        },
    });
    return request;
}
