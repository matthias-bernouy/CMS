import type { IntegrationPackageLimits } from "../../interfaces/envelope";
import type { IntegrationPackageSource, ResolvedIntegrationPackage } from "../../interfaces/source";
import { readIntegrationPackageDirectory } from "./reader";

export type FsIntegrationPackageLocation = {
    root: string;
    definition: string;
    releaseNotes?: string;
    legacy?: boolean;
};

export type FsIntegrationPackageSourceConfig = {
    locate(kind: string, version: string): Promise<FsIntegrationPackageLocation | null>;
    limits?: Partial<IntegrationPackageLimits>;
};

export class FsIntegrationPackageSource implements IntegrationPackageSource {
    private readonly cache = new Map<string, Promise<ResolvedIntegrationPackage | null>>();

    constructor(private readonly config: FsIntegrationPackageSourceConfig) {}

    getPackage(kind: string, version: string): Promise<ResolvedIntegrationPackage | null> {
        const key = packageKey(kind, version);
        const existing = this.cache.get(key);
        if (existing) {
            return existing;
        }
        const pending = this.load(kind, version);
        this.cache.set(key, pending);
        void pending.then(
            (result) => {
                if (!result) {
                    this.cache.delete(key);
                }
            },
            () => {
                this.cache.delete(key);
            },
        );
        return pending;
    }

    invalidate(kind?: string, version?: string): void {
        if (kind === undefined) {
            this.cache.clear();
            return;
        }
        if (version !== undefined) {
            this.cache.delete(packageKey(kind, version));
            return;
        }
        const prefix = `${kind}\0`;
        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                this.cache.delete(key);
            }
        }
    }

    private async load(kind: string, version: string): Promise<ResolvedIntegrationPackage | null> {
        const location = await this.config.locate(kind, version);
        if (!location) {
            return null;
        }
        return await readIntegrationPackageDirectory({
            ...location,
            kind,
            version,
            limits: this.config.limits,
        });
    }
}

function packageKey(kind: string, version: string): string {
    return `${kind}\0${version}`;
}
