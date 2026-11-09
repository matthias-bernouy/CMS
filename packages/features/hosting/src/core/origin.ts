import { domainToASCII } from "node:url";
import { isIP } from "node:net";
import { HostingError } from "./errors";

export function domainHostname(value: string): string {
    if (!value || value.length > 254 || value.trim() !== value || /[\s/@:#?\\]/u.test(value)) {
        throw new HostingError("INVALID_INPUT", "A DNS hostname is required");
    }
    const hostname = domainToASCII(value.replace(/\.$/u, "")).toLowerCase();
    if (
        !hostname ||
        hostname.length > 253 ||
        isIP(hostname) !== 0 ||
        hostname.split(".").some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label))
    ) {
        throw new HostingError("INVALID_INPUT", "A DNS hostname is required");
    }
    return hostname;
}

export function hostingOrigin(value: string): { origin: string; hostname: string; local: boolean } {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new HostingError("INVALID_INPUT", "An absolute hosting origin is required");
    }
    const hostname = domainHostname(url.hostname);
    const local = hostname === "localhost" || hostname.endsWith(".localhost");
    if (
        value.length > 2048 ||
        value.trim() !== value ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash ||
        (url.protocol !== "https:" && !(local && url.protocol === "http:"))
    ) {
        throw new HostingError("INVALID_INPUT", "Hosting requires HTTPS, except localhost development origins");
    }
    url.hostname = hostname;
    return { origin: url.origin, hostname, local };
}
