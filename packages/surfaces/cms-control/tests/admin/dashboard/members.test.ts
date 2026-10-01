import { expect, test } from "bun:test";
import { DashboardMembers } from "../../../src/components/admin/Resources/Dashboards/management/DashboardMembers";

test("member changes update in place without replacing the modal", () => {
    const members = new DashboardMembers();
    document.body.append(members);
    members.value = {
        users: [{ sub: "member", label: "Member", email: "member@example.com" }],
        members: [],
    };
    const root = members.shadowRoot!;
    const modal = root.querySelector("[data-modal]");
    const add = root.querySelector<HTMLElement>("[data-member-action]")!;

    add.click();
    expect(add.hasAttribute("disabled")).toBeTrue();

    members.setAssigned("member", true);

    expect(root.querySelector("[data-modal]")).toBe(modal);
    expect(root.querySelector("[data-count]")?.textContent).toBe("1");
    expect(root.querySelector("[data-member-action]")?.textContent).toBe("Remove");
    members.remove();
});

test("a failed member change can be retried without rebuilding the component", () => {
    const members = new DashboardMembers();
    document.body.append(members);
    members.value = {
        users: [{ sub: "member", label: "Member", email: "member@example.com" }],
        members: [],
    };
    const root = members.shadowRoot!;
    root.querySelector<HTMLElement>("[data-member-action]")!.click();

    members.clearPending("member");

    expect(root.querySelector("[data-member-action]")?.hasAttribute("disabled")).toBeFalse();
    members.remove();
});
