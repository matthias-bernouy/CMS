/**
 * An edge node in this origin's cluster. The origin pushes blob updates
 * to it via lsyncd-over-SSH and the edge serves public bucket traffic on
 * its own IP (registered in the public DNS round-robin for
 * `*.MAIN_DOMAIN`).
 *
 * Identity is operator-chosen (`id`) so the lsyncd config and the
 * monitoring UI stay readable. The remote target is fully described by
 * `(hostname, sshUser, sshPort, dataPath)` — anything else (cert reload,
 * health endpoint) is derived.
 */
export type Edge = {
    /** Operator-chosen identifier, e.g. "edge-eu-1". URL-safe, unique. */
    id:          string;
    /** Human label shown in the admin UI. Defaults to `id` when not set. */
    label:       string;
    /** SSH-reachable hostname or IP of the edge. */
    hostname:    string;
    /** SSH user on the edge with write access to `dataPath`. */
    sshUser:     string;
    /** SSH port; usually 22. */
    sshPort:     number;
    /** Absolute path on the edge that mirrors the origin's
     *  `/var/lib/cdn/buckets`. */
    dataPath:    string;
    /** Free-form notes. */
    notes:       string | null;
    /** ms epoch — when the edge row was added. */
    addedAt:     number;
    /** ms epoch — last successful probe. `null` until the first probe. */
    lastSeenAt:  number | null;
    /** ms epoch — last probe attempt (success OR failure). */
    lastProbeAt: number | null;
    /** Outcome of the last probe attempt. `null` until the first probe. */
    lastProbeOk: boolean | null;
    /** Short error message of the last probe failure, when applicable. */
    lastProbeError: string | null;
    /** Bytes used under `dataPath` on the edge, sampled by the last probe. */
    lastProbeUsedBytes: number | null;
    /** File count under `dataPath` on the edge, sampled by the last probe. */
    lastProbeFileCount: number | null;
    /** Last HTTPS probe — `null` until the edge has been HTTP-probed once. */
    lastProbeHttpOk:     boolean | null;
    /** HTTP status code returned by the last probe (200/301/404/etc), or `null`. */
    lastProbeHttpStatus: number | null;
    /** Short error message of the last failed HTTP probe. */
    lastProbeHttpError:  string | null;
};
