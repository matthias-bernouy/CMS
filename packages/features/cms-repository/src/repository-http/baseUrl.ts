/** Repository URLs have no credentials or request-specific components. */
export function repositoryBaseUrl(baseUrl: string, kind: string): URL {
    const url = new URL(baseUrl);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
        (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
    ) {
        throw new TypeError(`${kind} repository must use HTTPS or loopback HTTP without URL credentials`);
    }
    return new URL(`${url.toString().replace(/\/+$/, "")}/`);
}
