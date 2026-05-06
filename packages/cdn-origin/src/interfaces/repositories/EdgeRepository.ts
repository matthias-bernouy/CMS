import type { Edge } from "../entities/Edge";

export type EdgeProbeResult = {
    ok:           boolean;
    error:        string | null;
    usedBytes:    number | null;
    fileCount:    number | null;
};

export interface EdgeRepository {

    /** List all edges attached to this origin, ordered by `addedAt` asc. */
    list():               Promise<Edge[]>;

    /** Fetch an edge by id, or `null` if not found. */
    get(id: string):      Promise<Edge | null>;

    /** Insert a new edge. Throws on `id` conflict. */
    create(edge: Edge):   Promise<void>;

    /** Update mutable fields. No-op for unknown ids. */
    update(id: string, patch: Partial<Pick<Edge,
        "label" | "hostname" | "sshUser" | "sshPort" | "dataPath" | "notes"
    >>): Promise<void>;

    /** Record the outcome of a probe attempt. */
    recordProbe(id: string, result: EdgeProbeResult): Promise<void>;

    /** Remove an edge row. Idempotent. */
    delete(id: string):   Promise<void>;
}
