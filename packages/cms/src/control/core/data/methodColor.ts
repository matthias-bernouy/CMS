/**
 * Theme-color name (`p9r-tag color="…"`) to render an HTTP verb tag with.
 * Mirrors Postman / Swagger conventions so the admin reads as expected.
 */
export function methodColor(method: string): string {
    switch (method.toUpperCase()) {
        case "GET":     return "success";
        case "POST":    return "primary";
        case "PUT":     return "info";
        case "PATCH":   return "warning";
        case "DELETE":  return "danger";
        default:        return "secondary";
    }
}
