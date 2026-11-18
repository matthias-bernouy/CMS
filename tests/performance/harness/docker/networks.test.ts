import { expect, test } from "bun:test";
import { createTestNetwork, unusedTestSubnets } from "../../../integration/instance/containers/networks";

const name = "ulvia-mcp-1234abcd";
const exhausted = { code: 1, stdout: "", stderr: "all predefined address pools have been fully subnetted" };
const ok = (stdout = "") => ({ code: 0, stdout, stderr: "" });

test("fallback subnets exclude configured networks, host addresses, broad VPN routes and partial overlaps", () => {
    const free = unusedTestSubnets(
        ["10.253.0.0/24", "10.253.2.128/25", "fd00::/64"],
        ["default", "10.253.1.7", "10.253.4.0/23", "192.168.1.0/24"],
    );
    expect(free[0]).toBe("10.253.3.0/24");
    expect(free[1]).toBe("10.253.6.0/24");
    expect(free).not.toContain("10.253.5.0/24");
    expect(unusedTestSubnets([], ["10.0.0.0/8"])).toEqual([]);
    expect(unusedTestSubnets([], ["0.0.0.0/0"])).toEqual([]);
    expect(unusedTestSubnets([], ["10.253.255.255"]).at(-1)).toBe("10.253.254.0/24");
    for (const invalid of ["300.1.1.1/24", "10.0.0.0/33", "not-a-route", "10.253.0.0:invalid"]) {
        expect(() => unusedTestSubnets([], [invalid])).toThrow();
    }
    expect(() =>
        unusedTestSubnets(
            [],
            Array.from({ length: 16_385 }, () => "default"),
        ),
    ).toThrow("entry budget");
});

test("normal allocation needs no route access and refuses network names outside the disposable scope", async () => {
    const commands: string[][] = [];
    const run = async (args: string[]) => {
        commands.push(args);
        return ok("network-id");
    };
    const routes = async (): Promise<string[]> => {
        throw new Error("Unexpected route read");
    };
    await createTestNetwork(name, true, run, routes);
    expect(commands).toEqual([["network", "create", "--label", `io.ulvia.test.network=${name}`, "--internal", name]]);
    await expect(createTestNetwork("user-production-network", true, run, routes)).rejects.toThrow("ownership");
    expect(commands).toHaveLength(1);
});

test("exhaustion uses a bounded conflict-checked fallback and retries only an atomic subnet race", async () => {
    const commands: string[][] = [];
    let explicit = 0;
    const run = async (args: string[]) => {
        commands.push(args);
        if (args[1] === "ls") {
            return ok("abcdef123456\n");
        }
        if (args[1] === "inspect") {
            return ok(JSON.stringify([{ IPAM: { Config: [{ Subnet: "172.17.0.0/16" }] } }]));
        }
        if (!args.includes("--subnet")) {
            return exhausted;
        }
        return ++explicit === 1
            ? { code: 1, stdout: "", stderr: "Pool overlaps with other one on this address space" }
            : ok("owned-new-network");
    };
    await createTestNetwork(`${name}-ingress`, false, run, async () => ["default", "192.168.1.0/24"]);
    const created = commands.filter((args) => args[1] === "create" && args.includes("--subnet"));
    expect(created).toHaveLength(2);
    expect(created[0]).toContain("10.253.0.0/24");
    expect(created[1]).toContain("10.253.1.0/24");
    expect(
        created.every((args) => !args.includes("--internal") && args.includes(`io.ulvia.test.network=${name}-ingress`)),
    ).toBe(true);
    expect(commands.some((args) => args.includes("prune") || args.includes("rm") || args.includes("disconnect"))).toBe(
        false,
    );
});

test("unavailable routes, unrelated Docker failures and an incomplete inventory cannot allocate a fallback", async () => {
    for (const mode of ["routes", "inventory", "daemon"] as const) {
        let explicit = 0;
        const run = async (args: string[]) => {
            if (args.includes("--subnet")) {
                explicit++;
            }
            if (args[1] === "ls") {
                return ok("abcdef123456\n");
            }
            if (args[1] === "inspect") {
                return ok(mode === "inventory" ? "[]" : '[{"IPAM":{"Config":[]}}]');
            }
            return mode === "daemon" ? { ...exhausted, stderr: "daemon unavailable" } : exhausted;
        };
        await expect(
            createTestNetwork(name, true, run, async () => {
                throw new Error("route inventory unavailable");
            }),
        ).rejects.toThrow();
        expect(explicit).toBe(0);
    }
});

test("fallback allocation stops after four atomic collisions", async () => {
    let explicit = 0;
    const run = async (args: string[]) => {
        if (args[1] === "ls") {
            return ok();
        }
        if (args.includes("--subnet")) {
            explicit++;
            return { code: 1, stdout: "", stderr: "Pool overlaps with other one on this address space" };
        }
        return exhausted;
    };
    await expect(createTestNetwork(name, true, run, async () => [])).rejects.toThrow("No uncontested");
    expect(explicit).toBe(4);
});
