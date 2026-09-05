const schemaRequests = new Map<string, Promise<unknown>>();

export async function loadSchema(url) {
    const key = url.href;
    const existing = schemaRequests.get(key);
    if (existing) {
        return existing;
    }
    const request = fetch(url, {
        credentials: "include",
        headers: { accept: "application/json" },
    })
        .then(async (response) => {
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(response.status === 404 ? "Category unavailable." : "Filters could not be loaded.");
            }
            if (!body || typeof body !== "object" || Array.isArray(body)) {
                throw new Error("Invalid filter response.");
            }
            return body;
        })
        .finally(() => schemaRequests.delete(key));
    schemaRequests.set(key, request);
    return request;
}

export function schemaSourceUrl(_host) {
    return "/.cms/sources/commerce/offerFilterSchema";
}
