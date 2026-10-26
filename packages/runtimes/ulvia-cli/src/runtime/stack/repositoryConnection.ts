export type InstallationRepository = Readonly<{
    url: string;
    allowInsecureHttp: boolean;
}>;

export function defaultRepositoryConnection(
    environment: Record<string, string | undefined> = {},
): InstallationRepository {
    const insecure = environment.CMS_REPOSITORY_ALLOW_INSECURE_HTTP;
    if (insecure !== undefined && insecure !== "true" && insecure !== "false") {
        throw new Error("CMS_REPOSITORY_ALLOW_INSECURE_HTTP must be true or false");
    }
    return parseRepositoryConnection({
        url: environment.CMS_REPOSITORY_URL ?? "https://repo.ulvia.fr",
        allowInsecureHttp: insecure === "true",
    });
}

export function parseRepositoryConnection(value: unknown): InstallationRepository {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Repository connection is invalid");
    }
    const record = value as Record<string, unknown>;
    if (typeof record.url !== "string" || typeof record.allowInsecureHttp !== "boolean") {
        throw new Error("Repository connection is invalid");
    }
    const url = new URL(record.url);
    if (
        (url.protocol !== "https:" && !(url.protocol === "http:" && record.allowInsecureHttp)) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/"
    ) {
        throw new Error("Repository URL must be an HTTPS origin; HTTP requires explicit opt-in");
    }
    return Object.freeze({ url: url.origin, allowInsecureHttp: record.allowInsecureHttp });
}
