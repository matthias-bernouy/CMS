import type { TBlocWrite, ThemeSource } from "@bernouy/content";
import type { ResourcePage, ResourceTextSource } from "resources/artifacts/archive/schemas";
import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";
import type { ResolvedContract } from "@bernouy/ulvia-contracts";
export interface ResourceBrowserState {
    readonly id: string;
    readonly scope: "param" | "page" | "session" | "persistent";
    readonly schema: UlviaSchema;
}
export interface PreparedResourceSource {
    readonly namespace: string;
    readonly locale: string;
    readonly states: readonly ResourceBrowserState[];
    readonly translations: Readonly<Record<string, Readonly<Record<string, string>>>>;
    readonly blocs: readonly TBlocWrite[];
    readonly examples: readonly Readonly<{ path: string; html: string }>[];
    readonly pages: readonly ResourcePage[];
    readonly texts: readonly ResourceTextSource["texts"][number][];
    readonly theme: ThemeSource | null;
    readonly assets: readonly Readonly<{
        id: string;
        mediaType: string;
        bytes: Blob;
        profiles?: readonly ["inline-svg"];
    }>[];
}
export interface ResourceSourceBuildOptions {
    readonly locale: string;
    readonly contracts: readonly ResolvedContract[];
    readonly omitPages?: ReadonlyMap<string, ReadonlySet<string>>;
}
