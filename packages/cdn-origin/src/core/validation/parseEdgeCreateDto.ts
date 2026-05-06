export type EdgeCreateDto = {
    id:       string;
    label:    string | null;
    hostname: string;
    sshUser:  string;
    sshPort:  number;
    dataPath: string;
    notes:    string | null;
};

const ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;          // URL-safe + lsyncd-friendly
const HOST_RE = /^[a-zA-Z0-9._-]{1,253}$/;          // hostname / IP, no scheme
const USER_RE = /^[a-z_][a-z0-9_-]{0,31}$/;         // POSIX-ish user name
const ABS_PATH_RE = /^\/[A-Za-z0-9._/-]{1,1023}$/;  // absolute path, conservative whitelist

/**
 * Validate + normalise the request body for `POST /admin/origin/api/edges`.
 * Throws `TypeError` (mapped by `wrapAdmin` to `validation_error`) on the
 * first failure. Accepts unknown extra fields and drops them — the input
 * type is treated as a least-trusted source.
 */
export function parseEdgeCreateDto(body: Record<string, unknown>): EdgeCreateDto {
    const id       = mustString(body.id,       "id");
    const hostname = mustString(body.hostname, "hostname");
    const sshUser  = mustString(body.sshUser,  "sshUser");
    const dataPath = mustString(body.dataPath, "dataPath");
    const sshPort  = body.sshPort === undefined ? 22 : mustInt(body.sshPort, "sshPort");
    const label    = body.label === undefined || body.label === null || body.label === "" ? null : mustString(body.label, "label");
    const notes    = body.notes === undefined || body.notes === null || body.notes === "" ? null : mustString(body.notes, "notes");

    if (!ID_RE.test(id))             throw new TypeError(`id must match ${ID_RE} (got "${id}").`);
    if (!HOST_RE.test(hostname))     throw new TypeError(`hostname is invalid: "${hostname}".`);
    if (!USER_RE.test(sshUser))      throw new TypeError(`sshUser is invalid: "${sshUser}".`);
    if (!ABS_PATH_RE.test(dataPath)) throw new TypeError(`dataPath must be an absolute path under a conservative whitelist (got "${dataPath}").`);
    if (sshPort < 1 || sshPort > 65535) throw new TypeError(`sshPort out of range: ${sshPort}.`);
    if (label && label.length > 80)  throw new TypeError(`label too long (max 80 chars).`);
    if (notes && notes.length > 500) throw new TypeError(`notes too long (max 500 chars).`);

    return { id, label, hostname, sshUser, sshPort, dataPath, notes };
}

function mustString(v: unknown, field: string): string {
    if (typeof v !== "string" || v.length === 0) throw new TypeError(`${field} must be a non-empty string.`);
    return v;
}

function mustInt(v: unknown, field: string): number {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isInteger(n)) throw new TypeError(`${field} must be an integer.`);
    return n;
}
