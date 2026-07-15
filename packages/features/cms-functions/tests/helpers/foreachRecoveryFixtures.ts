import type {
    CmsFunction,
    FunctionCall,
    FunctionForEach,
} from "@bernouy/cms-functions";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { productsSource } from "./functionFixtures";

export type RecoveryItem = {
    id: string;
    recoveryId: string;
};

export function recoveringProductsFunction(
    items: RecoveryItem[] = [
        { id: "p1", recoveryId: "r1" },
        { id: "p2", recoveryId: "r2" },
    ],
): CmsFunction {
    return {
        id: "recoverProducts",
        method: "GET",
        steps: [{
            id: "loop",
            forEach: {
                items,
                max: Math.max(items.length, 1),
                continueOnError: true,
                steps: [{ id: "product", call: productCall("$item.id") }],
                yield: {
                    itemId: "$item.id",
                    failed: false,
                    productId: "$steps.product.id",
                },
                onError: [{ id: "recovered", call: productCall("$item.recoveryId") }],
                errorYield: {
                    itemId: "$item.id",
                    failed: true,
                    recoveryId: "$steps.recovered.id",
                },
            },
        }],
        return: { body: "$steps.loop" },
    };
}

export function recoveryLoop(fn: CmsFunction): FunctionForEach {
    const step = fn.steps[0];
    if (step && "forEach" in step) return step.forEach;
    throw new Error("Expected the recovery fixture to start with a forEach step");
}

export function productCall(productId: string): FunctionCall {
    return {
        source: "products",
        endpoint: "getProduct",
        params: { productId },
    };
}

export async function productSources(options: { passthroughProductResponses?: boolean } = {}): Promise<InMemorySourceRepository> {
    const sources = new InMemorySourceRepository();
    const source = productsSource();
    if (options.passthroughProductResponses) {
        const productEndpoint = source.endpoints.find(endpoint => endpoint.urn === "urn:products:getProduct");
        if (!productEndpoint) throw new Error("Expected the products fixture to expose getProduct");
        productEndpoint.output = undefined;
    }
    await sources.createSource(source);
    return sources;
}

export function functionRequest(): Request {
    return new Request("https://cms.test/function");
}

export function requestProductId(input: RequestInfo | URL): string {
    const request = input instanceof Request ? input : new Request(input);
    return new URL(request.url).searchParams.get("productId") ?? "";
}
