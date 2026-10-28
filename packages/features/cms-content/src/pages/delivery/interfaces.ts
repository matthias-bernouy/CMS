import type { ContentReader, RenderablePage } from "cms-content/application/interfaces/ContentReader";
import type { Cache } from "@bernouy/http-runner";
import type { Logger } from "@bernouy/logging";
import type { PageCapabilityAccessPort } from "./access/PageCapabilityAnalyzer";

export type DeliveryActor = { readonly kind: "anonymous" | "user" | "administrator"; readonly subjectId?: string };
/** All ports are supplied by the hosting Provider. No credentials or target endpoints enter Content. */
export default interface ContentDeliveryHost {
    observe?<T>(phase: string, operation: () => Promise<T>): Promise<T>;
    readonly content: ContentReader;
    readonly cache: Cache;
    readonly logger: Logger;
    readonly basePath: string;
    readonly cmsPathPrefix: string;
    readonly pageCapabilities?: PageCapabilityAccessPort;
    readonly editorialPages?: {
        resolveRoute(path: string): Promise<{ readonly page: RenderablePage; readonly language: string } | null>;
    };
    resolveActor(request: Request): Promise<DeliveryActor>;
    resolveContributedAssets(input: string): Promise<string>;
    resolveSvgSources?(sources: readonly string[]): Promise<ReadonlyMap<string, string | Uint8Array>>;
    executeQuery?(
        contractId: string,
        capabilityId: string,
        input: Readonly<Record<string, string | number>>,
    ): Promise<Response>;
}
