import { deepFreeze } from "@bernouy/ulvia-contracts/protocol";
import supported from "./supported-releases.json";

export type ExecutionRelease = Readonly<{ contractId: string; version: string; digest: string }>;
export type ExecutionProfile = Readonly<{
    manifest: Readonly<{ providerId: string; version: string; digest: string }>;
    contracts: readonly ExecutionRelease[];
}>;

/** Explicit implementation evidence; recipes and installed state cannot expand this set. */
export class ProviderExecutionSupport {
    readonly providerId: string;
    readonly buildVersion: string;
    readonly releases: readonly ExecutionRelease[];
    private readonly keys: ReadonlySet<string>;

    constructor(definition = supported) {
        const snapshot = deepFreeze(structuredClone(definition));
        this.providerId = snapshot.providerId;
        this.buildVersion = snapshot.buildVersion;
        this.releases = snapshot.releases;
        this.keys = new Set(snapshot.releases.map(releaseKey));
        if (!this.keys.size || this.keys.size !== snapshot.releases.length || this.keys.size > 128) {
            throw new Error("Invalid Provider implementation support matrix");
        }
    }

    assert(release: ExecutionRelease, location: string): void {
        if (!this.keys.has(releaseKey(release))) {
            throw new Error(
                `Provider build does not support ${release.contractId}@${release.version} required by ${location}`,
            );
        }
    }
}

function releaseKey(pin: ExecutionRelease): string {
    return `${pin.contractId}\0${pin.version}\0${pin.digest}`;
}
