import { domainHostname } from "../origin";
import { HostingError } from "../errors";

export function zoneHostname(value: string) {
    const hostname = domainHostname(value);
    if (hostname.length > 241 || !hostname.includes(".") || hostname.endsWith(".localhost")) {
        throw new HostingError("INVALID_INPUT", "A public DNS zone with room for its TXT proof is required");
    }
    return hostname;
}

/** At most 126 exact candidates for a DNS hostname; never list all registered zones. */
export function zoneCandidates(value: string) {
    const labels = domainHostname(value).split(".");
    return labels.slice(0, -1).map((_, index) => labels.slice(index).join("."));
}
