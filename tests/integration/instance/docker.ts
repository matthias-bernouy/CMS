export async function docker(args: string[], allowFailure = false) {
    const child = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe" });
    const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
    ]);
    if (code && !allowFailure) {
        throw new Error(`Docker ${args[0]} failed: ${stderr.slice(-3000)}`);
    }
    return { code, stdout, stderr };
}

export async function mappedPort(name: string, port: number) {
    return `http://${(await docker(["port", name, `${port}/tcp`])).stdout.trim()}`;
}
export async function waitForHttp(url: string, headers: Record<string, string> = {}) {
    for (let attempt = 0; attempt < 150; attempt += 1) {
        const response = await fetch(url, { headers, signal: AbortSignal.timeout(1000) }).catch(() => null);
        await response?.body?.cancel();
        if (response?.ok) {
            return;
        }
        await Bun.sleep(200);
    }
    throw new Error(`Container did not become ready: ${url}`);
}
