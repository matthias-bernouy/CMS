/**
 * Issue `nginx -s reload`. Throws with the captured stderr on non-zero exit.
 * `nginxBinary` defaults to `"nginx"` (assumed in PATH).
 */
export async function reload(nginxBinary: string = "nginx"): Promise<void> {
    const proc = Bun.spawn([nginxBinary, "-s", "reload"], {
        stdout: "pipe",
        stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(`nginx reload failed (exit ${exitCode}): ${stderr}`);
    }
}
