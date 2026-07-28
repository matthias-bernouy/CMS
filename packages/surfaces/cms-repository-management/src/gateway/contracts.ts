import type { Authentication } from "@bernouy/cms-auth";
import type { Runner } from "@bernouy/http-runner";

export type RepositoryManagementGatewayRequest = Readonly<{
    actor: string;
    method: "GET" | "POST";
    path: string;
    query: string;
    contentType?: string;
    body?: Uint8Array;
}>;

export interface RepositoryManagementGatewayTransport {
    forward(request: RepositoryManagementGatewayRequest): Promise<Response>;
}

export type RepositoryManagementGatewayConfig<Role extends string> = Readonly<{
    runner: Runner;
    authentication: Authentication<Role>;
    requiredRole: Role;
    transport: RepositoryManagementGatewayTransport;
    candidateBodyLimitBytes?: number;
    mutationBodyLimitBytes?: number;
}>;
