/** Repository URLs have no credentials or request-specific components. */
export function repositoryBaseUrl(
    baseUrl: string,
    kind: string,
    options: Readonly<{ allowInsecureHttp?: boolean }> = {},
): URL {
    const url = new URL(baseUrl);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
        (url.protocol !== "https:" &&
            !(url.protocol === "http:" && (loopback || options.allowInsecureHttp === true))) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
    ) {
        throw new TypeError(`${kind} repository must use HTTPS or explicitly allowed HTTP without URL credentials`);
    }
    return new URL(`${url.toString().replace(/\/+$/, "")}/`);
}
