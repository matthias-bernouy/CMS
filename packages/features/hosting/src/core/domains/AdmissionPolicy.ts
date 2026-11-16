import { domainHostname, hostingOrigin } from "../origin";
import { HostingError } from "../errors";
import type { HostingActor } from "hosting/interfaces/state";
import type { ZoneRegistry } from "../zones/ZoneRegistry";

/** Deployment suffixes and verified Control zones grant admission; caller input grants no trust. */
export class DomainAdmissionPolicy {
    private readonly suffixes: readonly string[];
    constructor(
        suffixes: readonly string[],
        private readonly localDevelopment: boolean,
        private readonly zones?: Pick<ZoneRegistry, "admits">,
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

    async admit(publicOrigin: string, actor: HostingActor) {
        const classified = this.classify(publicOrigin);
        return {
            ...classified,
            managed: classified.managed || (await this.zones?.admits(actor, classified.hostname)) === true,
        };
    }
}
