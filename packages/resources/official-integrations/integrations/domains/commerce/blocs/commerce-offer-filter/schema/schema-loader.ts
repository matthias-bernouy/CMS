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
                throw new Error(
                    response.status === 404 ? "Catégorie indisponible." : "Impossible de charger les filtres.",
                );
            }
            if (!body || typeof body !== "object" || Array.isArray(body)) {
                throw new Error("Réponse de filtres invalide.");
            }
            return body;
        })
        .finally(() => schemaRequests.delete(key));
    schemaRequests.set(key, request);
    return request;
}

export function schemaSourceUrl(host) {
    const prefix = (host.getAttribute("source-prefix") || "/.cms/sources").replace(/\/+$/, "");
    const sourceId = encodeURIComponent(host.getAttribute("source-id") || "commerce");
    const endpoint = encodeURIComponent(host.getAttribute("schema-endpoint") || "offerFilterSchema");
    return `${prefix}/${sourceId}/${endpoint}`;
}
