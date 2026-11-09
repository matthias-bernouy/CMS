import { domainHostname, hostingOrigin } from "../origin";
import { HostingError } from "../errors";

/** Deployment configuration grants managed suffixes; tenant input cannot grant trust. */
export class DomainAdmissionPolicy {
    private readonly suffixes: readonly string[];
    constructor(
        suffixes: readonly string[],
        private readonly localDevelopment: boolean,
    ) {
        this.suffixes = suffixes.map(domainHostname);
    }

    classify(publicOrigin: string) {
        const parsed = hostingOrigin(publicOrigin);
        if (parsed.local && !this.localDevelopment) {
            throw new HostingError("INVALID_INPUT", "Localhost domains are unavailable on this installation");
        }
        const managed =
            parsed.local ||
            this.suffixes.some((suffix) => parsed.hostname === suffix || parsed.hostname.endsWith(`.${suffix}`));
        return { ...parsed, managed };
    }
}
