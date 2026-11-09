import type { RepositoryAuthoring } from "repository/repository/authoring/resources/RepositoryAuthoring";
/** Public structural service port; feature implementations need no private host/publisher state. */
export type AuthoringService = Pick<
    RepositoryAuthoring,
    | "connectionStatus"
    | "configureConnection"
    | "disconnectConnection"
    | "listNamespaces"
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
    readonly authoring: AuthoringService;
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
