/** Stable same-origin gateway transports shared by Control and Delivery. */
export const CMS_CAPABILITY_CALL_ROUTE = "/.cms/call";
export const CMS_CAPABILITY_MEDIA_ROUTE = "/.cms/media";
export const CMS_CAPABILITY_IMAGE_ROUTE = "/.cms/image";

export function gatewayRoutePrefix(basePath: string, route: string): string {
    return `${basePath === "/" ? "" : basePath.replace(/\/$/u, "")}${route}`;
}
