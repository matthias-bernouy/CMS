import { Component } from "@bernouy/components/base";
import type { User } from "../domain/types";
import template from "./members.html" with { type: "text" };
import css from "./members.css" with { type: "text" };

type Modal = HTMLElement & { showModal(): void; hide(): void };
type ValueControl = HTMLElement & { value?: string };

export class DashboardMembers extends Component {
    private users: User[] = [];
    private memberIds = new Set<string>();
    private pendingIds = new Set<string>();
    private connected = false;

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
    }

    override connectedCallback(): void {
        if (this.connected) {
            return;
        }
        this.connected = true;
        this.root.querySelector("[data-open]")!.addEventListener("click", () => this.modal().showModal());
        this.root.querySelector("[data-close]")!.addEventListener("click", () => this.modal().hide());
        this.root.querySelector("[data-search]")!.addEventListener("input", () => this.renderList());
        this.root.querySelector("[data-list]")!.addEventListener("click", (event) => this.onListClick(event));
        this.render();
    }

    set value(value: { users: User[]; members: string[] }) {
        this.users = value.users;
        this.memberIds = new Set(value.members);
        this.pendingIds.clear();
        this.render();
    }

    setAssigned(subjectId: string, assigned: boolean): void {
        if (assigned) {
            this.memberIds.add(subjectId);
        } else {
            this.memberIds.delete(subjectId);
        }
        this.pendingIds.delete(subjectId);
        this.render();
    }

    clearPending(subjectId: string): void {
        this.pendingIds.delete(subjectId);
        this.renderList();
    }

    private render(): void {
        if (!this.root.querySelector("[data-avatars]")) {
            return;
        }
        this.renderAvatars();
        this.renderList();
    }

    private renderAvatars(): void {
        const assigned = this.users.filter((user) => this.memberIds.has(user.sub));
        const avatars = assigned.slice(0, 3).map((user) => {
            const avatar = document.createElement("span");
            avatar.className = "member-avatar";
            avatar.title = user.label || user.email;
            avatar.textContent = this.initials(user.label || user.email);
            return avatar;
        });
        if (assigned.length === 0) {
            const empty = document.createElement("span");
            empty.className = "member-avatar member-avatar-empty";
            empty.title = "No members assigned";
            empty.setAttribute("aria-hidden", "true");
            const icon = document.createElement("cms-library-icon");
            icon.setAttribute("name", "users");
            empty.append(icon);
            avatars.push(empty);
        }
        if (assigned.length > 3) {
            const more = document.createElement("span");
            more.className = "member-avatar member-avatar-more";
            more.textContent = `+${assigned.length - 3}`;
            avatars.push(more);
        }
        const group = this.root.querySelector("[data-avatars]")!;
        const count = assigned.length;
        group.setAttribute(
            "aria-label",
            count === 0 ? "No members assigned" : `${count} ${count === 1 ? "member" : "members"} assigned`,
        );
        group.replaceChildren(...avatars);
    }

    private initials(label: string): string {
        return (
            label
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase() ?? "")
                .join("") || "?"
        );
    }

    private renderList(): void {
        const list = this.root.querySelector("[data-list]");
        if (!list) {
            return;
        }
        const query = (this.field("[data-search]").value ?? "").trim().toLocaleLowerCase();
        const visible = this.users.filter((user) => `${user.label} ${user.email}`.toLocaleLowerCase().includes(query));
        list.replaceChildren(...visible.map((user) => this.row(user)));
        this.root.querySelector("[data-empty]")!.toggleAttribute("hidden", visible.length > 0);
    }

    private row(user: User): HTMLElement {
        const row = document.createElement("div");
        row.className = "member-row";
        const identity = document.createElement("div");
        identity.className = "member-identity";
        const name = document.createElement("strong");
        name.textContent = user.label || user.sub;
        const email = document.createElement("span");
        email.textContent = user.email;
        identity.append(name, email);
        const assigned = this.memberIds.has(user.sub);
        const tag = document.createElement("p9r-tag");
        tag.textContent = assigned ? "Member" : "Available";
        if (assigned) {
            tag.setAttribute("color", "success");
        }
        const action = document.createElement("p9r-button");
        action.setAttribute("type", "button");
        action.setAttribute("variant", "outlined");
        action.dataset.memberAction = assigned ? "unassign" : "assign";
        action.dataset.subjectId = user.sub;
        action.textContent = assigned ? "Remove" : "Add";
        action.toggleAttribute("disabled", this.pendingIds.has(user.sub));
        if (assigned) {
            action.setAttribute("color", "danger");
        }
        row.append(identity, tag, action);
        return row;
    }

    private onListClick(event: Event): void {
        const action = (event.target as Element).closest<HTMLElement>("[data-member-action]");
        if (!action?.dataset.subjectId) {
            return;
        }
        if (this.pendingIds.has(action.dataset.subjectId)) {
            return;
        }
        this.pendingIds.add(action.dataset.subjectId);
        action.setAttribute("disabled", "");
        this.dispatchEvent(
            new CustomEvent("dashboard-member-change", {
                bubbles: true,
                composed: true,
                detail: { action: action.dataset.memberAction, subjectId: action.dataset.subjectId },
            }),
        );
    }

    private field(selector: string): ValueControl {
        return this.root.querySelector(selector) as ValueControl;
    }

    private modal(): Modal {
        return this.root.querySelector("[data-modal]") as Modal;
    }

    private get root(): ShadowRoot {
        return this.shadowRoot!;
    }
}

customElements.define("cms-dashboard-members", DashboardMembers);
