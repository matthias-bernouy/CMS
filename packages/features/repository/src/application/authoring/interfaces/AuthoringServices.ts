import type { CaptureServices } from "@bernouy/content/captures";
import type { AdmittedCollectionRelease } from "repository/collections/interfaces/CollectionAdmission";
import type { CaptureDependencyReference } from "repository/application/authoring/schemas/preparations/captures";
import type { RepositoryAuthoring } from "repository/repository/authoring/resources/RepositoryAuthoring";
/** Public structural service port; feature implementations need no private host/publisher state. */
export type AuthoringService = Pick<
    RepositoryAuthoring,
    | "connectionStatus"
    | "configureConnection"
    | "disconnectConnection"
    | "listNamespaces"
    | "listPreparations"
    | "claim"
    | "prepare"
    | "publish"
    | "sources"
    | "discard"
    | "prepareArtifact"
    | "publishArtifact"
    | "artifactSources"
>;
export interface AuthoringServices {
    readonly authoring: AuthoringService & Partial<Pick<RepositoryAuthoring, "preview">>;
    readonly authoringCaptures?: CaptureServices & {
        dependencies(
            references: readonly CaptureDependencyReference[],
            maxAssetBytes: number,
        ): Promise<readonly AdmittedCollectionRelease[]>;
    };
    readonly authoringAuthority?: {
        administrator(actor: { providerId: string; subjectId: string }): Promise<boolean>;
    };
    readonly authoringOperations?: {
        get(
            siteId: string,
            input: { operationId: string; preparationId: string; expectedDigest: string },
            actor: { providerId: string; subjectId?: string },
        ): Promise<{
            operationId: string;
            status: "queued" | "running" | "succeeded" | "failed";
            result?: unknown;
            errorCode?: string;
            errorOutput?: unknown;
        }>;
    };
}
