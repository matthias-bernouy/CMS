/** Stable same-origin gateway transports shared by Control and Delivery. */
export const CMS_CAPABILITY_CALL_ROUTE = "/.cms/call";

export function gatewayRoutePrefix(basePath: string, route: string): string {
    return `${basePath === "/" ? "" : basePath.replace(/\/$/u, "")}${route}`;
}
