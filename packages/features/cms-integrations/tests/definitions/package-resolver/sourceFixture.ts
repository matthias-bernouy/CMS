import type { IntegrationPackageSource, ResolvedIntegrationPackage } from "@bernouy/cms-integration-packages";
import { FsIntegrationPackageSource } from "@bernouy/cms-integration-packages/fs";

export type PackageSourceCall = { kind: string; version: string };
export type PackageSourceLoader = (
    kind: string,
    version: string,
) => Promise<ResolvedIntegrationPackage | null> | ResolvedIntegrationPackage | null;

export class RecordingPackageSource implements IntegrationPackageSource {
    readonly calls: PackageSourceCall[] = [];

    constructor(private readonly loader: PackageSourceLoader) {}

    async getPackage(kind: string, version: string): Promise<ResolvedIntegrationPackage | null> {
        this.calls.push({ kind, version });
        return await this.loader(kind, version);
    }
}

export function staticPackageSource(input: ResolvedIntegrationPackage | null): RecordingPackageSource {
    return new RecordingPackageSource(() => input);
}

export function failingPackageSource(error: Error): RecordingPackageSource {
    return new RecordingPackageSource(() => {
        throw error;
    });
}

export function directoryPackageSource(root: string, input: ResolvedIntegrationPackage): RecordingPackageSource {
    const filesystem = new FsIntegrationPackageSource({
        locate: async (kind, version) => {
            if (kind !== input.envelope.kind || version !== input.envelope.version) {
                return null;
            }
            return {
                root,
                definition: input.envelope.definition,
                releaseNotes: input.envelope.releaseNotes,
            };
        },
    });
    return new RecordingPackageSource(async (kind, version) => await filesystem.getPackage(kind, version));
}

export function repositoryStatusError(status: 502 | 503): Error & { status: number } {
    return Object.assign(new Error(`repository failed with ${status}`), { status });
}
