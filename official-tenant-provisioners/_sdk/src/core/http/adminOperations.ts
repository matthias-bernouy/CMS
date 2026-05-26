import type { ApiOperationMeta } from "src/core/schemas/operationMeta";
import { meta as provision }    from "src/api/admin/tenants.post";
import { meta as update }       from "src/api/admin/tenants.patch";
import { meta as deprov }       from "src/api/admin/tenants.delete";
import { meta as listT }        from "src/api/admin/tenants.get";
import { meta as adminLogs }    from "src/api/admin/logs.get";
import { meta as adminConfig }  from "src/api/admin/config.get";
import { meta as tenantInfo }   from "src/api/admin/info.get";

/**
 * The frozen plane-1 surface (base.md §8 + §10.5 + §11.3). Single source
 * the spec generator AND the anti-drift test use: every `api/admin/*.ts`
 * route MUST appear here with its `meta`, and vice versa.
 */
export const ADMIN_OPERATIONS: ReadonlyArray<{
    method: "get" | "post" | "patch" | "delete";
    path:   string;
    meta:   ApiOperationMeta;
}> = [
    { method: "post",   path: "/admin/tenants", meta: provision },
    { method: "patch",  path: "/admin/tenants", meta: update },
    { method: "delete", path: "/admin/tenants", meta: deprov },
    { method: "get",    path: "/admin/tenants", meta: listT },
    { method: "get",    path: "/admin/logs",    meta: adminLogs },
    { method: "get",    path: "/admin/config",  meta: adminConfig },
    { method: "get",    path: "/admin/info",    meta: tenantInfo },
];
