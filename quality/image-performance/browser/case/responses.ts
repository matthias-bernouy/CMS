import type { Page } from "playwright";
import type { BrowserImageEvidence, BrowserResponseCaptureEvidence } from "../contracts";

type CapturedImageResponse = {
    url: string;
    responseStatus: number;
    responseContentType: string | null;
    body: Promise<{
        base64: string;
        bytes: number;
    } | null>;
};

type ResolvedImageResponse = Omit<CapturedImageResponse, "body"> & {
    body: Awaited<CapturedImageResponse["body"]>;
};

export function captureImageResponses(page: Page): CapturedImageResponse[] {
    const capturedResponses: CapturedImageResponse[] = [];
    page.on("response", (response) => {
        const url = new URL(response.url());
        if (url.pathname !== "/image/original.png") {
            return;
        }
        capturedResponses.push({
            url: response.url(),
            responseStatus: response.status(),
            responseContentType: response.headers()["content-type"] ?? null,
            body: response
                .body()
                .then((body) => ({
                    base64: body.toString("base64"),
                    bytes: body.byteLength,
                }))
                .catch(() => null),
        });
    });
    return capturedResponses;
}

export async function readBrowserEvidence(page: Page, capturedResponses: CapturedImageResponse[]) {
    const domEvidence = await page.evaluate(() => {
        const currentSources = Object.fromEntries(
            [...document.querySelectorAll<HTMLImageElement>("img[data-slot]")].map((image) => [
                image.dataset.slot!,
                image.currentSrc,
            ]),
        ) as Record<"narrow" | "wide", string>;
        return {
            cls: window.__cls ?? 0,
            currentSources,
            order: window.__activationOrder ?? {},
            domProbes: window.__domProbes!,
        };
    });
    const resolvedResponses = await Promise.all(
        capturedResponses.map(
            async (response): Promise<ResolvedImageResponse> => ({
                ...response,
                body: await response.body,
            }),
        ),
    );
    const consumedResponses = new Set<number>();
    const images = {} as Record<"narrow" | "wide", BrowserImageEvidence>;
    for (const slot of ["narrow", "wide"] as const) {
        const currentSrc = domEvidence.currentSources[slot];
        const captured = takeCapturedResponse(resolvedResponses, currentSrc, consumedResponses);
        const decoded = captured?.body
            ? await decodeCapturedImage(page, captured.body.base64, captured.responseContentType)
            : null;
        images[slot] = {
            currentSrc,
            selectedWidth: null,
            responseStatus: captured?.responseStatus ?? null,
            decodedWidth: decoded?.width ?? null,
            decodedHeight: decoded?.height ?? null,
            responseContentType: captured?.responseContentType ?? null,
        };
    }
    return {
        cls: domEvidence.cls,
        images,
        responseCaptures: resolvedResponses.map(responseCaptureEvidence),
        order: domEvidence.order,
        domProbes: domEvidence.domProbes,
    };
}

function takeCapturedResponse(
    responses: ResolvedImageResponse[],
    url: string,
    consumed: Set<number>,
): ResolvedImageResponse | undefined {
    const index = responses.findIndex(
        (response, responseIndex) => response.url === url && !consumed.has(responseIndex),
    );
    if (index < 0) {
        return undefined;
    }
    consumed.add(index);
    return responses[index];
}

function responseCaptureEvidence(response: ResolvedImageResponse): BrowserResponseCaptureEvidence {
    return {
        url: response.url,
        responseStatus: response.responseStatus,
        responseContentType: response.responseContentType,
        bodyBytes: response.body?.bytes ?? null,
    };
}

async function decodeCapturedImage(
    page: Page,
    base64: string,
    contentType: string | null,
): Promise<{ width: number; height: number }> {
    return page.evaluate(
        async ({ encoded, mediaType }) => {
            const binary = atob(encoded);
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index += 1) {
                bytes[index] = binary.charCodeAt(index);
            }
            const bitmap = await createImageBitmap(new Blob([bytes], { type: mediaType ?? undefined }));
            try {
                return { width: bitmap.width, height: bitmap.height };
            } finally {
                bitmap.close();
            }
        },
        { encoded: base64, mediaType: contentType },
    );
}
