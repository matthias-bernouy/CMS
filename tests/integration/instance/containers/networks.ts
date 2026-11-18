import { command } from "../../../../infra/process";
import { docker } from "../docker";
import { isIP } from "node:net";

type Run = typeof docker;

/** Never prune other projects or change daemon-wide address pools to make disposable tests start. */
export async function createTestNetwork(name: string, internal: boolean, run: Run = docker, routes = hostRoutes) {
    if (!/^ulvia-mcp-[a-f0-9]{8}(?:-ingress)?$/u.test(name)) {
        throw new Error("Disposable network ownership refused");
    }
    const base = ["network", "create", "--label", `io.ulvia.test.network=${name}`, ...(internal ? ["--internal"] : [])];
    const first = await run([...base, name], true);
    if (first.code === 0) {
        return;
    }
    if (!first.stderr.includes("all predefined address pools have been fully subnetted")) {
        throw new Error(`Disposable Docker network creation failed: ${first.stderr.slice(-1000)}`);
    }
    const list = (await run(["network", "ls", "--format", "{{.ID}}"])).stdout.trim().split("\n").filter(Boolean);
    if (list.length > 1024 || list.some((id) => !/^[a-f0-9]{12,64}$/u.test(id))) {
        throw new Error("Docker network inventory exceeded its validation budget");
    }
    const text = list.length ? (await run(["network", "inspect", ...list])).stdout : "[]";
    if (Buffer.byteLength(text) > 2 * 1024 * 1024) {
        throw new Error("Docker network inventory byte budget exceeded");
    }
    const inventory = JSON.parse(text) as { IPAM?: { Config?: { Subnet?: string }[] } }[];
    if (!Array.isArray(inventory) || inventory.length !== list.length) {
        throw new Error("Docker network inventory is incomplete");
    }
    const subnets = inventory.flatMap(
        (entry) => entry.IPAM?.Config?.flatMap((config) => (config.Subnet ? [config.Subnet] : [])) ?? [],
    );
    const candidates = unusedTestSubnets(subnets, await routes()).slice(0, 4);
    for (const subnet of candidates) {
        const created = await run([...base, "--subnet", subnet, name], true);
        if (created.code === 0) {
            return;
        }
        if (!created.stderr.includes("Pool overlaps with other one on this address space")) {
            throw new Error(`Disposable subnet creation failed: ${created.stderr.slice(-1000)}`);
        }
    }
    throw new Error("No uncontested disposable test subnet is available");
}

/** Exclude every configured IPv4 network and non-default host route, including broad VPN routes. */
export function unusedTestSubnets(subnets: readonly string[], routes: readonly string[]) {
    if (subnets.length + routes.length > 16_384) {
        throw new Error("Disposable subnet conflict inventory exceeded its entry budget");
    }
    const occupied = [...subnets, ...routes]
        .filter((value) => value !== "default" && isIP(value.split("/")[0]!) !== 6)
        .map(addressRange);
    const result: string[] = [];
    for (let index = 0; index < 256; index++) {
        const subnet = `10.253.${index}.0/24`;
        const candidate = addressRange(subnet);
        if (!occupied.some((range) => range[0] <= candidate[1] && candidate[0] <= range[1])) {
            result.push(subnet);
        }
    }
    return result;
}

function addressRange(value: string): readonly [number, number] {
    const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/u.exec(value);
    if (!match || match.slice(1, 5).some((part) => Number(part) > 255) || Number(match[5] ?? 32) > 32) {
        throw new Error("Invalid IPv4 conflict range");
    }
    const address = match.slice(1, 5).reduce((sum, part) => sum * 256 + Number(part), 0);
    const size = 2 ** (32 - Number(match[5] ?? 32));
    const start = Math.floor(address / size) * size;
    return [start, start + size - 1];
}

async function hostRoutes(): Promise<string[]> {
    const text = await command(["ip", "-j", "-4", "route", "show", "table", "all"], { capture: true });
    if (Buffer.byteLength(text) > 2 * 1024 * 1024) {
        throw new Error("Host route inventory byte budget exceeded");
    }
    const rows = JSON.parse(text) as { dst?: unknown }[];
    if (!Array.isArray(rows) || rows.length > 16_384 || rows.some((row) => typeof row.dst !== "string")) {
        throw new Error("Invalid host route inventory");
    }
    return rows.map((row) => String(row.dst));
}
