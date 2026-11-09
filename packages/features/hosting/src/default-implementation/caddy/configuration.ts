export interface CaddyHostingConfiguration {
    readonly permissionUrl: string;
    readonly upstreams: readonly string[];
    readonly storageRoot: string;
    readonly privatePort?: number;
    readonly tls:
        | false
        | {
              readonly issuer: "acme" | "internal";
              readonly directory?: string;
              readonly email?: string;
              readonly trustedRoots?: readonly string[];
              readonly publicPort?: number;
          };
}

/** Static shared destinations; domain admission stays dynamic through the admitted permission binding. */
export function createCaddyHostingConfiguration(options: CaddyHostingConfiguration) {
    const endpoint = new URL(options.permissionUrl);
    if (
        !/^https?:$/u.test(endpoint.protocol) ||
        endpoint.username ||
        endpoint.password ||
        endpoint.search ||
        endpoint.hash ||
        options.permissionUrl.length > 2048
    ) {
        throw new TypeError("Caddy permission endpoint is invalid");
    }
    if (
        !options.storageRoot.startsWith("/") ||
        options.storageRoot.includes("\0") ||
        options.storageRoot.length > 1024
    ) {
        throw new TypeError("Caddy certificate storage must use an absolute mounted directory");
    }
    if (
        !options.upstreams.length ||
        options.upstreams.length > 16 ||
        new Set(options.upstreams).size !== options.upstreams.length
    ) {
        throw new TypeError("Caddy requires between 1 and 16 distinct shared Edge destinations");
    }
    const upstreams = options.upstreams.map((dial) => {
        const url = new URL(`http://${dial}`);
        if (
            !url.port ||
            url.host !== dial ||
            url.username ||
            url.password ||
            url.pathname !== "/" ||
            url.search ||
            url.hash
        ) {
            throw new TypeError("Shared Edge destinations require host:port");
        }
        return { dial };
    });
    const proxy = {
        handler: "reverse_proxy",
        upstreams,
        headers: { request: { set: { Host: ["{http.request.hostport}"] } } },
        load_balancing: { selection_policy: { policy: "round_robin" } },
        health_checks: { active: { uri: "/readyz", interval: "10s", timeout: "3s", expect_status: 204 } },
    };
    const publicPort = options.tls ? (options.tls.publicPort ?? 443) : 443;
    if (!Number.isSafeInteger(publicPort) || publicPort < 1 || publicPort > 65535) {
        throw new TypeError("Caddy public HTTPS port is invalid");
    }
    const plain = {
        listen: [":80"],
        automatic_https: { disable: true },
        routes: [
            {
                handle: [
                    options.tls
                        ? {
                              handler: "static_response",
                              status_code: 308,
                              headers: {
                                  Location: [
                                      `https://{http.request.host}${publicPort === 443 ? "" : `:${publicPort}`}{http.request.uri}`,
                                  ],
                              },
                          }
                        : proxy,
                ],
            },
        ],
    };
    if (
        options.privatePort !== undefined &&
        (!Number.isSafeInteger(options.privatePort) || options.privatePort < 1024 || options.privatePort > 65535)
    ) {
        throw new TypeError("Caddy private HTTP port is invalid");
    }
    const privateServer =
        options.privatePort === undefined
            ? {}
            : {
                  ulvia_private: {
                      listen: [`:${options.privatePort}`],
                      automatic_https: { disable: true },
                      routes: [{ handle: [proxy] }],
                  },
              };
    const common = { admin: { disabled: true }, storage: { module: "file_system", root: options.storageRoot } };
    if (!options.tls) {
        return { ...common, apps: { http: { servers: { ulvia_http: plain, ...privateServer } } } };
    }
    const tls = options.tls;
    if (tls.issuer === "acme" && !tls.directory) {
        throw new TypeError("An explicit ACME directory is required");
    }
    if (tls.directory) {
        const directory = new URL(tls.directory);
        if (
            directory.protocol !== "https:" ||
            directory.username ||
            directory.password ||
            directory.hash ||
            tls.directory.length > 2048
        ) {
            throw new TypeError("ACME directory must be an HTTPS URL");
        }
    }
    if (
        (tls.trustedRoots?.length ?? 0) > 8 ||
        tls.trustedRoots?.some((path) => !path.startsWith("/") || path.includes("\0") || path.length > 1024)
    ) {
        throw new TypeError("ACME trusted roots must be absolute mounted PEM paths");
    }
    const issuer =
        tls.issuer === "internal"
            ? { module: "internal" }
            : {
                  module: "acme",
                  ca: tls.directory,
                  test_ca: tls.directory,
                  ...(tls.email ? { email: tls.email } : {}),
                  ...(tls.trustedRoots?.length ? { trusted_roots_pem_files: tls.trustedRoots } : {}),
              };
    return {
        ...common,
        apps: {
            http: {
                servers: {
                    ulvia_http: plain,
                    ...privateServer,
                    ulvia_https: {
                        listen: [":443"],
                        automatic_https: { disable: true },
                        tls_connection_policies: [{}],
                        routes: [{ handle: [proxy] }],
                    },
                },
            },
            tls: {
                automation: {
                    policies: [{ on_demand: true, issuers: [issuer] }],
                    on_demand: { permission: { module: "http", endpoint: endpoint.href } },
                },
            },
        },
    };
}
