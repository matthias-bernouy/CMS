import { canUpgradeOfficialInstanceProfile } from "@bernouy/ulvia-provider";
import type {
    OfficialInstanceProfile,
    OfficialInstanceProfileSource,
    OfficialProfileListing,
} from "@bernouy/ulvia-provider";
import { deepFreeze } from "@bernouy/ulvia-contracts/protocol";
import { CURRENT_PROFILE, SUPPORTED_PROFILES } from "../definitions";
import { loadOfficialProfile, type LoadedOfficialProfile } from "../artifacts";
import type { OfficialBootstrapSources } from "../bootstrap";

type ProfileRef = OfficialProfileListing["defaultProfile"];

/** Discovery reads references only; exact resources are loaded for the requested profile. */
export class LazyOfficialProfiles implements OfficialInstanceProfileSource {
    private readonly pending = new Map<string, Promise<LoadedOfficialProfile | null>>();
    private readonly known: ReadonlySet<string>;
    private readonly listing: OfficialProfileListing;

    constructor(
        listing: OfficialProfileListing,
        private readonly load: (reference: ProfileRef) => Promise<LoadedOfficialProfile | null>,
    ) {
        this.listing = deepFreeze(structuredClone(listing));
        this.known = new Set(listing.profiles.map(key));
        if (
            !this.known.size ||
            this.known.size > 32 ||
            this.known.size !== listing.profiles.length ||
            !this.known.has(key(listing.defaultProfile))
        ) {
            throw new TypeError("Invalid installation profile references");
        }
    }

    describe(): OfficialProfileListing {
        return this.listing;
    }

    async resolve(id: string, version: string) {
        return (await this.artifacts({ id, version }))?.profile ?? null;
    }

    canUpgrade(source: OfficialInstanceProfile, target: OfficialInstanceProfile): boolean {
        return canUpgradeOfficialInstanceProfile(source, target);
    }

    async contracts(profile: OfficialInstanceProfile) {
        const artifacts = await this.artifacts(profile);
        const contracts = profile.contracts.map((pin) =>
            artifacts?.contracts.find(
                ({ release, digest }) =>
                    release.contractId === pin.contractId && release.version === pin.version && digest === pin.digest,
            ),
        );
        if (contracts.some((contract) => !contract)) {
            throw new Error("Provisioning contracts are unavailable");
        }
        return contracts.filter((contract) => contract !== undefined);
    }

    private artifacts(reference: ProfileRef) {
        const coordinate = key(reference);
        if (!this.known.has(coordinate)) {
            return Promise.resolve(null);
        }
        let pending = this.pending.get(coordinate);
        if (!pending) {
            const load = this.load({ id: reference.id, version: reference.version }).then((result) => {
                if (!result || key(result.profile) !== coordinate) {
                    throw new Error("Exact installation profile is unavailable");
                }
                return result;
            });
            pending = load;
            this.pending.set(coordinate, load);
            void load.catch(() => {
                if (this.pending.get(coordinate) === load) {
                    this.pending.delete(coordinate);
                }
            });
        }
        return pending;
    }
}

/** Core profiles do not enumerate or hydrate any optional starter's collections. */
export function bundledOfficialProfiles(sources: OfficialBootstrapSources): LazyOfficialProfiles {
    const reference = ({ id, version }: ProfileRef) => ({ id, version });
    return new LazyOfficialProfiles(
        { defaultProfile: reference(CURRENT_PROFILE), profiles: SUPPORTED_PROFILES.map(reference) },
        async (requested) => {
            const definition = SUPPORTED_PROFILES.find(
                ({ id, version }) => id === requested.id && version === requested.version,
            );
            return definition
                ? loadOfficialProfile(
                      sources.providers,
                      sources.collections,
                      await sources.providers.list("provider-manifest"),
                      definition,
                  )
                : null;
        },
    );
}

function key(reference: ProfileRef) {
    return `${reference.id}\0${reference.version}`;
}
