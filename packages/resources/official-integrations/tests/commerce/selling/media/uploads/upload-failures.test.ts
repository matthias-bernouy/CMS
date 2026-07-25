import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../../harness";
import { imageForm, pngBytes } from "../fixtures";
import { callKind, objectPath, storageCalls, useMediaResponder } from "./uploadHarness";

installCommerceTestEnvironment();

describe("Commerce image upload recovery", () => {
    test("deletes only the uncommitted upload when the attach recheck loses its race", async () => {
        useMediaResponder({ attachFailure: true });

        const response = await requestCommerce("/admin/product/image?productId=9", {
            formData: imageForm(pngBytes()),
        });
        const calls = capturedFetches();
        const storage = storageCalls();

        expect(response.status).toBe(404);
        expect(calls.map(callKind)).toEqual([
            "authorize_product_media_upload",
            "storage:POST",
            "attach_product_media_v2",
            "storage:DELETE",
        ]);
        expect(storage[1]!.url).toBe(storage[0]!.url);
    });

    test("retains the uploaded original when the attach result is ambiguous", async () => {
        useMediaResponder({ ambiguousAttachResult: true });

        const response = await requestCommerce("/admin/product/image?productId=9", {
            formData: imageForm(pngBytes()),
        });

        expect(response.status).toBe(500);
        expect(capturedFetches().map(callKind)).toEqual([
            "authorize_product_media_upload",
            "storage:POST",
            "attach_product_media_v2",
        ]);
        expect(storageCalls().some((call) => call.method === "DELETE")).toBeFalse();
    });

    test.each([
        {
            label: "offer",
            path: "/me/offer/image?offerId=42",
            request: { userId: "seller-7" },
            authorization: "authorize_offer_media_upload",
            authorizationResponse: { state: "authorized", offer_id: 42, replace_media_id: null },
        },
        {
            label: "product",
            path: "/admin/product/image?productId=9",
            request: {},
            authorization: "authorize_product_media_upload",
            authorizationResponse: { state: "authorized", product_id: 9, replace_media_id: null },
        },
    ])("removes an unattached $label path when the Storage upload result is ambiguous", async (scenario) => {
        const persistedPaths = new Set<string>();
        setRestResponder((request) => {
            const kind = callKind(request);
            if (kind === scenario.authorization) {
                return jsonResponse(scenario.authorizationResponse);
            }
            if (kind === "storage:POST") {
                persistedPaths.add(objectPath(request.url));
                throw new TypeError("Storage response was lost after persistence");
            }
            if (kind === "storage:DELETE") {
                persistedPaths.delete(objectPath(request.url));
                return new Response(null, { status: 200 });
            }
            throw new Error(`unexpected media request ${request.method} ${request.url}`);
        });
        const response = await requestCommerce(scenario.path, {
            ...scenario.request,
            formData: imageForm(pngBytes()),
        });
        const storage = storageCalls();
        expect(response.status).toBe(500);
        expect(capturedFetches().map(callKind)).toEqual([scenario.authorization, "storage:POST", "storage:DELETE"]);
        expect(storage[1]!.url).toBe(storage[0]!.url);
        expect(persistedPaths.size).toBe(0);
    });

    test("keeps the Storage upload error when its cleanup also fails", async () => {
        const realWarn = console.warn;
        const warnings: unknown[][] = [];
        console.warn = (...values: unknown[]) => {
            warnings.push(values);
        };
        try {
            setRestResponder((request) => {
                const kind = callKind(request);
                if (kind === "authorize_product_media_upload") {
                    return jsonResponse({ state: "authorized", product_id: 9, replace_media_id: null });
                }
                if (kind === "storage:POST") {
                    return jsonResponse({ message: "storage upload unavailable" }, 503);
                }
                if (kind === "storage:DELETE") {
                    return jsonResponse({ message: "storage cleanup unavailable" }, 503);
                }
                throw new Error(`unexpected media request ${request.method} ${request.url}`);
            });

            const response = await requestCommerce("/admin/product/image?productId=9", {
                formData: imageForm(pngBytes()),
            });
            const storage = storageCalls();

            expect(response.status).toBe(502);
            expect(await response.json()).toEqual({ error: "storage upload unavailable" });
            expect(capturedFetches().map(callKind)).toEqual([
                "authorize_product_media_upload",
                "storage:POST",
                "storage:DELETE",
            ]);
            expect(storage[1]!.url).toBe(storage[0]!.url);
            expect(warnings).toHaveLength(1);
        } finally {
            console.warn = realWarn;
        }
    });
});
