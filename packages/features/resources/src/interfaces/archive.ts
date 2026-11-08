import type { TBloc, ThemeSettings } from "@bernouy/content";
import type { ZipOptions, ZipSourceEntry } from "@bernouy/zip";
import type { ResourceAsset, ResourcePage, ResourceTextSource } from "resources/archive/schemas";

export interface ResourceDocument {
    readonly format: "ulvia-resources/v1";
    readonly blocs: readonly TBloc[];
    readonly theme: ThemeSettings | null;
    readonly texts: readonly ResourceTextSource[];
    readonly assets: readonly ResourceAsset[];
    readonly pages: readonly ResourcePage[];
}
export interface VerifiedResourceArchive {
    readonly digest: `sha256:${string}`;
    readonly bytes: Blob;
    readonly document: ResourceDocument;
    readonly assets: readonly Readonly<{ definition: ResourceAsset; bytes: Blob }>[];
}
export interface ResourceArchiveOptions extends ZipOptions {
    readonly expectedDigest: string;
}
export interface ResourceArchiveSource {
    readonly document: unknown;
    readonly assets: readonly ZipSourceEntry[];
}
