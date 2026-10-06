import { expect, test } from "bun:test";
import { renderLoginPage } from "cms-control/core/admin/auth/authPages";

test("renders the native credential and redirect controls without legacy custom elements", async () => {
    const response = renderLoginPage(new Request("http://control.test/login?returnTo=%2Fadmin%2Ffiles"), "/cms", [
        { id: "local", displayName: "Email", fields: ["email", "password"] },
        { id: "company", displayName: "Company SSO", loginUrl: "/cms/auth/company/login" },
    ]);
    const html = await response.text();

    expect(html).toContain('action="/cms/auth/login"');
    expect(html).toContain('name="email"');
    expect(html).toContain('name="password"');
    expect(html).toContain('href="/cms/auth/company/login?returnTo=%2Fadmin%2Ffiles"');
    expect(html).not.toMatch(/p9r-|cms-login-methods|control-components/u);
});

test("does not expose a credentials form when local authentication is unavailable", async () => {
    const response = renderLoginPage(new Request("http://control.test/login"), "", [
        { id: "company", displayName: "Company SSO", loginUrl: "/auth/company/login" },
    ]);
    const html = await response.text();

    expect(html).not.toContain('name="password"');
    expect(html).toContain("Company SSO");
});
