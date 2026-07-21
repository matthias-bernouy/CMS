import { executeFunction } from "@bernouy/cms-functions";
import { InMemoryIdentityService } from "@bernouy/cms-identities";
import { expect } from "bun:test";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import {
    sellerCmsUserId,
    sellerTermsHash,
    sellerTermsVersion,
    successfulInput,
} from "./fixtures";
import { sellerPriceSources } from "./sources/index";

export type CapturedCall = {
    url: URL;
    method: string;
    body: unknown;
    cmsUserId: string | null;
    stripeUserId: string | null;
};

type Responder = (request: Request) => Response | Promise<Response>;
type User = { id: string; role: string };

export async function executeSellerPrice(
    responder: Responder,
    options: {
        request?: Request;
        user?: User | null;
        identities?: InMemoryIdentityService;
    } = {},
): Promise<{
    response: Response;
    calls: CapturedCall[];
    identities: InMemoryIdentityService;
}> {
    const calls: CapturedCall[] = [];
    const identities = options.identities ?? new InMemoryIdentityService();
    const response = await executeFunction(
        await loadSellerPriceFunction(),
        options.request ?? sellerPriceRequest(),
        {
            sources: await sellerPriceSources(),
            identities,
            user: options.user === null
                ? undefined
                : options.user ?? { id: sellerCmsUserId, role: "user" },
            deps: {
                identities,
                resolveSecret: async () => "seller-price-cms-api-key",
                fetchImpl: async (input, init) => {
                    const request = new Request(input, init);
                    calls.push({
                        url: new URL(request.url),
                        method: request.method,
                        body: await requestBody(request),
                        cmsUserId: request.headers.get("x-cms-user-id"),
                        stripeUserId: request.headers.get("x-user-id"),
                    });
                    return await responder(request);
                },
            },
        },
    );
    return { response, calls, identities };
}

export async function loadSellerPriceFunction() {
    const definition = await new FsIntegrationDefinitionRepository(
        OFFICIAL_INTEGRATIONS_ROOT,
    ).get("commerce-stripe-payments");
    const artifact = definition?.artifacts?.find(item =>
        item.type === "function"
        && item.function.id === "submitSellerOfferPrice"
    );
    if (!artifact || artifact.type !== "function") {
        throw new Error("submitSellerOfferPrice function not found");
    }
    const fn = structuredClone(artifact.function);
    resolveSources(fn);
    return fn;
}

export function sellerPriceRequest(...args: [unknown?]): Request {
    const body = args.length === 0 ? successfulInput : args[0];
    return new Request(
        "https://cms.test/functions/submitSellerOfferPrice",
        {
            method: "POST",
            headers: { "content-type": "application/json" },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
    );
}

export async function expectGenericFailure(
    response: Response,
    status = 502,
): Promise<void> {
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body).toEqual({
        error: "Function execution failed",
        correlationId: expect.any(String),
    });
    expect(JSON.stringify(body)).not.toContain("private");
    expect(JSON.stringify(body)).not.toContain(sellerCmsUserId);
}

async function requestBody(request: Request): Promise<unknown> {
    if (request.body === null) return undefined;
    return await request.clone().json();
}

function resolveSources(value: unknown): void {
    if (Array.isArray(value)) {
        value.forEach(resolveSources);
        return;
    }
    if (!isRecord(value)) return;
    for (const [key, nested] of Object.entries(value)) {
        if (typeof nested === "string") {
            value[key] = nested
                .replaceAll("{{dependencies.commerce.sourceId}}", "commerce")
                .replaceAll("{{dependencies.stripe.sourceId}}", "stripe-connect")
                .replaceAll("{{answers.sellerTermsVersion}}", sellerTermsVersion)
                .replaceAll("{{answers.sellerTermsHash}}", sellerTermsHash);
        } else {
            resolveSources(nested);
        }
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object"
        && !Array.isArray(value);
}
