import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
export async function collectionRequest(path: string, body?: unknown, method = "POST") {
    const response = await fetch(
        `${getMetaBasePath()}/api/collections/${path}`,
        body === undefined
            ? { cache: "no-store" }
            : {
                  method,
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body),
              },
    );
    if (!response.ok) {
        throw new Error(
            response.status === 409
                ? "The collection changed. Reload before saving."
                : `Request failed (${response.status}): ${await response.text()}`,
        );
    }
    return response.json();
}
