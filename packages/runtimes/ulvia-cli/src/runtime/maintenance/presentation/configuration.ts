import { MAINTENANCE_HTML } from "@bernouy/content/public-delivery";
import type { MaintenancePages } from "./model";
export function maintenanceConfiguration(pages: MaintenancePages, certificates: number) {
    const headers = {
        handler: "headers",
        response: {
            set: {
                "Cache-Control": ["no-store"],
                "Retry-After": ["60"],
                "X-Robots-Tag": ["noindex, nofollow"],
                "Content-Security-Policy": [
                    "default-src 'none'; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' https:; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
                ],
                "X-Content-Type-Options": ["nosniff"],
                "Ulvia-Maintenance": ["upgrade"],
            },
        },
    };
    const html = (body: string) => ({
        handler: "static_response",
        status_code: 503,
        body,
        headers: { "Content-Type": ["text/html; charset=utf-8"] },
    });
    const routes = [
        {
            match: [{ not: [{ method: ["GET", "HEAD"] }] }],
            handle: [
                {
                    handler: "static_response",
                    status_code: 503,
                    body: '{"error":"installation_maintenance"}',
                    headers: { "Content-Type": ["application/json"] },
                },
            ],
            terminal: true,
        },
        ...pages.sites.map((site) => ({
            match: [{ host: site.hosts }],
            terminal: true,
            handle: [
                {
                    handler: "subroute",
                    routes: [
                        ...site.resources.map((type, index) => ({
                            match: [{ path: [`/_content/maintenance/${site.id}/${index}`] }],
                            terminal: true,
                            handle: [
                                { handler: "headers", response: { set: { "Content-Type": [type] } } },
                                { handler: "rewrite", uri: `/${index}` },
                                { handler: "file_server", root: `/snapshot/sites/${site.id}`, canonical_uris: false },
                            ],
                        })),
                        {
                            handle: [
                                {
                                    handler: "headers",
                                    response: { set: { "Content-Type": ["text/html; charset=utf-8"] } },
                                },
                                { handler: "rewrite", uri: "/page.html" },
                                {
                                    handler: "file_server",
                                    root: `/snapshot/sites/${site.id}`,
                                    status_code: "503",
                                    canonical_uris: false,
                                },
                            ],
                        },
                    ],
                },
            ],
        })),
        { handle: [html(MAINTENANCE_HTML)] },
    ];
    const server = (listen: string[], tls = false) => ({
        listen,
        automatic_https: { disable: true },
        ...(tls ? { tls_connection_policies: [{}] } : {}),
        routes: [{ handle: [headers, { handler: "subroute", routes }] }],
    });
    return {
        admin: { disabled: true },
        apps: {
            http: { servers: { http: server([":80"]), ...(certificates ? { https: server([":443"], true) } : {}) } },
            ...(certificates
                ? {
                      tls: {
                          certificates: {
                              load_files: Array.from({ length: certificates }, (_, i) => ({
                                  certificate: `/snapshot/certificates/${i}.crt`,
                                  key: `/snapshot/certificates/${i}.key`,
                              })),
                          },
                      },
                  }
                : {}),
        },
    };
}
