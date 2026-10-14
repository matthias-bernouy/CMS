/** Stable same-origin gateway transports exposed by the site Kernel. */
export const CMS_CAPABILITY_CALL_ROUTE = "/.cms/call";
export const CMS_CAPABILITY_QUERY_ROUTE = "/.cms/query";

export function gatewayRoutePrefix(basePath: string, route: string): string {
    return `${basePath === "/" ? "" : basePath.replace(/\/$/u, "")}${route}`;
}
