import { deepFreeze } from "cms-repository/exports/contracts/protocol";

/** Protocol metadata only; no route is mounted and no request is sent by this package. */
export const PROVIDER_CONNECTION_PROTOCOL = deepFreeze({
    protocol: "ulvia-provider/v1",
    authentication: "bearer",
    report: { method: "GET", path: "/ulvia/report" },
    registration: { method: "PUT", path: "/ulvia/connections/{installationId}" },
    disconnect: { method: "DELETE", path: "/ulvia/connections/{installationId}" },
} as const);
