/** RFC 7807 problem document (base.md §6). */
export interface ProblemDocument {
    type:     string;   // URI by error slug
    title:    string;   // short, status-derived
    status:   number;
    detail:   string;   // opaque for 401/403/5xx (base.md §6)
    instance: string;   // request path (no query / no secrets)
}
