import type { ProviderManagement } from "@bernouy/cms-repository/providers/management";
import type { OfficialInstanceProfile } from "@bernouy/ulvia-provider";

const REFRESH_AFTER_MS = 30_000;
const RETRY_AFTER_MS = 5_000;

type Management = Pick<ProviderManagement, "list" | "refreshObservation">;

/** Renews the official self-provider observation without keeping an idle instance open. */
export class OfficialProviderObservation {
    #nextCheckAt = 0;
    #refreshing?: Promise<void>;

    constructor(
        private readonly management: Management,
        private readonly instanceId: string,
        private readonly profile: OfficialInstanceProfile,
        private readonly now: () => number = Date.now,
        private readonly reportError: (error: unknown) => void = () => undefined,
    ) {}

    ensureFresh(): Promise<void> {
        if (this.now() < this.#nextCheckAt) {
            return Promise.resolve();
        }
        this.#refreshing ??= this.#refresh().finally(() => {
            this.#refreshing = undefined;
        });
        return this.#refreshing;
    }

    async #refresh(): Promise<void> {
        try {
            const state = await this.management.list();
            const installation = state.installations.find(
                (item) => item.providerId === this.profile.manifest.providerId && item.accountId === this.instanceId,
            );
            if (!installation || installation.status !== "enabled") {
                this.#nextCheckAt = this.now() + RETRY_AFTER_MS;
                return;
            }
            const observedAt = installation.observedAt ? Date.parse(installation.observedAt) : Number.NaN;
            const complete = this.profile.contracts.every((contract) =>
                installation.contracts.some(
                    (observed) =>
                        observed.contractId === contract.contractId &&
                        observed.version === contract.version &&
                        observed.digest === contract.digest &&
                        observed.status === "ready",
                ),
            );
            if (complete && Number.isFinite(observedAt) && this.now() - observedAt < REFRESH_AFTER_MS) {
                this.#nextCheckAt = observedAt + REFRESH_AFTER_MS;
                return;
            }
            await this.management.refreshObservation(installation.id);
            this.#nextCheckAt = this.now() + REFRESH_AFTER_MS;
        } catch (error) {
            this.#nextCheckAt = this.now() + RETRY_AFTER_MS;
            this.reportError(error);
        }
    }
}
