import { COLLECTION_PUBLICATION_ISSUES } from "cms-repository/exports/collections/index";
import type {
    CollectionPublicationCode,
    CollectionPublicationResource,
} from "cms-repository/exports/collections/index";
import { RepositoryRequestError } from "../../core/errors";
import { RepositoryHttpError, repositoryErrorBody } from "cms-repository/repository-http/errors";
import { parseStrictJson } from "cms-repository/exports/contracts/protocol";
import { boundedResponseBytes, repositoryUrl } from "./index";
import type { RepositoryConnectionCredential } from "./credentials";

export class RepositoryConnection {
    readonly base: URL;
    constructor(
        origin: string,
        private readonly credential?: RepositoryConnectionCredential,
        options: Readonly<{ allowInsecureHttp?: boolean }> = {},
    ) {
        this.base = repositoryUrl(origin, options);
        if (credential && credential.origin !== this.base.origin) {
            throw new Error("Repository credentials belong to a different origin");
        }
    }

    async identity(): Promise<string> {
        const value = (await this.json("v1/info", "GET")) as { repositoryId?: unknown; protocol?: unknown };
        if (
            value.protocol !== "ulvia-repository/v1" ||
            typeof value.repositoryId !== "string" ||
            !/^[A-Za-z0-9._:-]{1,128}$/u.test(value.repositoryId)
        ) {
            throw new Error("Repository returned an invalid identity");
        }
        return value.repositoryId;
    }

    async json(
        path: string,
        method: string,
        input?: unknown,
        authenticated = false,
        maximum = 1024 * 1024,
    ): Promise<unknown> {
        const response = await this.request(
            path,
            {
                method,
                ...(input === undefined
                    ? {}
                    : { body: JSON.stringify(input), headers: { "content-type": "application/json" } }),
            },
            authenticated,
        );
        return this.readJson(response, maximum);
    }

    async readJson(response: Response, maximum = 1024 * 1024): Promise<unknown> {
        if (!response.ok) {
            const body = await repositoryErrorBody(response);
            if (response.status === 409 && body) {
                try {
                    const value = parseStrictJson(body, 4096, 8) as {
                        error?: {
                            code?: unknown;
                            output?: { publicationCode?: unknown; publicationResource?: unknown };
                        };
                    };
                    const code = value?.error?.output?.publicationCode;
                    if (
                        value?.error?.code === "REJECTED" &&
                        typeof code === "string" &&
                        Object.hasOwn(COLLECTION_PUBLICATION_ISSUES, code)
                    ) {
                        const publicationCode = code as CollectionPublicationCode;
                        const candidate = value.error?.output?.publicationResource as
                            | CollectionPublicationResource
                            | undefined;
                        const resource =
                            candidate &&
                            ["bloc", "theme-token", "configuration", "text", "asset", "state"].includes(
                                candidate.kind,
                            ) &&
                            typeof candidate.id === "string" &&
                            /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,511}$/u.test(candidate.id)
                                ? { kind: candidate.kind, id: candidate.id }
                                : undefined;
                        throw new RepositoryRequestError(
                            "REJECTED",
                            `${resource ? `${resource.kind} ${resource.id}: ` : ""}${COLLECTION_PUBLICATION_ISSUES[publicationCode]}`,
                            publicationCode,
                            resource,
                        );
                    }
                } catch (error) {
                    if (error instanceof RepositoryRequestError) {
                        throw error;
                    }
                }
            }
            if (response.status >= 400 && response.status < 500) {
                throw new RepositoryRequestError("REJECTED", `Repository request failed (${response.status})`);
            }
            throw new RepositoryHttpError(response.status);
        }
        return response.status === 204
            ? null
            : parseStrictJson(await boundedResponseBytes(response, maximum), maximum, 64);
    }

    async request(path: string, init: RequestInit = {}, authenticated = false): Promise<Response> {
        const url = new URL(path, this.base);
        if (
            url.origin !== this.base.origin ||
            !url.pathname.startsWith(this.base.pathname) ||
            url.username ||
            url.password
        ) {
            throw new Error("Repository request is outside the configured endpoint");
        }
        const headers = new Headers(init.headers);
        headers.set("accept", "application/json");
        if (authenticated) {
            if (!this.credential || (await this.identity()) !== this.credential.repositoryId) {
                throw new RepositoryRequestError(
                    "REJECTED",
                    "Repository identity changed or credentials are unavailable",
                );
            }
            const token = await this.credential.resolveToken();
            if (!/^pat_[A-Za-z0-9_-]{43}$/u.test(token)) {
                throw new Error("Repository personal access token is invalid");
            }
            headers.set("authorization", `Bearer ${token}`);
        }
        return fetch(url, { ...init, headers, redirect: "error", signal: init.signal ?? AbortSignal.timeout(120_000) });
    }
}
