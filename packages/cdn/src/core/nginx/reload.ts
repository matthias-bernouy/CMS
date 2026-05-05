/**
 * Issue `nginx -s reload`. Throws with the captured stderr on non-zero exit.
 * `nginxBinary` defaults to `"nginx"` (assumed in PATH). Whitespace in the
 * value is honored as an argv split, so passing `"sudo /usr/sbin/nginx"`
 * spawns `sudo /usr/sbin/nginx -s reload` rather than looking for a binary
 * literally named `sudo /usr/sbin/nginx`.
 */
export async function reload(nginxBinary: string = "nginx"): Promise<void> {
    const argv = nginxBinary.split(/\s+/).filter(Boolean);
    const proc = Bun.spawn([...argv, "-s", "reload"], {
        stdout: "pipe",
        stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(`nginx reload failed (exit ${exitCode}): ${stderr}`);
    }
}
