import type { CmsFunction } from "@bernouy/cms-functions";

export function loadProductsFunction(): CmsFunction {
    return {
        id: "loadProducts",
        method: "GET",
        steps: [
            { id: "list", call: { source: "products", endpoint: "listProducts" } },
            {
                id: "details",
                forEach: {
                    items: "$steps.list.items",
                    max: 5,
                    steps: [{ id: "detail", call: productCall() }],
                    yield: { index: "$index", itemId: "$item.id", product: "$steps.detail" },
                },
            },
        ],
        return: { body: "$steps.details" },
    };
}

export function itemOutsideLoop(): CmsFunction {
    return {
        id: "badItem",
        method: "GET",
        steps: [{ id: "product", call: productCall() }],
        return: { body: "$steps.product" },
    };
}

export function nestedLoop(): CmsFunction {
    return {
        id: "nested",
        method: "GET",
        steps: [
            {
                id: "outer",
                forEach: {
                    items: [{ id: "p1" }],
                    max: 1,
                    steps: [
                        {
                            id: "inner",
                            forEach: {
                                items: [{ id: "p2" }],
                                max: 1,
                                steps: [{ id: "product", call: productCall() }],
                            },
                        },
                    ],
                },
            },
        ],
        return: { body: "$steps.outer" },
    };
}

export function tooManyCalls(): CmsFunction {
    return {
        id: "tooMany",
        method: "GET",
        steps: [
            { id: "list", call: { source: "products", endpoint: "listProducts" } },
            {
                id: "loop",
                forEach: { items: "$steps.list.items", max: 50, steps: [{ id: "product", call: productCall() }] },
            },
        ],
        return: { body: "$steps.loop" },
    };
}

export function limitedFunction(): CmsFunction {
    const definition = tooManyCalls();
    definition.id = "limited";
    (definition.steps[1] as Extract<CmsFunction["steps"][number], { forEach: unknown }>).forEach.max = 1;
    return definition;
}

export function continuingLoop(max: number): CmsFunction {
    return {
        id: `continuingLoop${max}`,
        method: "GET",
        steps: [
            {
                id: "loop",
                forEach: {
                    items: [{ id: "p1" }],
                    max,
                    continueOnError: true,
                    steps: [
                        { id: "firstCall", call: productCall() },
                        { id: "lastCall", call: productCall() },
                    ],
                    onError: [{ id: "markFailure", call: productCall() }],
                },
            },
        ],
        return: { body: "$steps.loop" },
    };
}

export function productCall() {
    return { source: "products", endpoint: "getProduct", params: { productId: "$item.id" } };
}
