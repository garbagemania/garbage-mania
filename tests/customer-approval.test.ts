import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ADMIN_NAV } from "@/config/admin-nav";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("customer sign-up approval is wired end to end", () => {
  it("login blocks customers who are not approved", () => {
    const src = read("src/app/(auth)/login/actions.ts");
    expect(src).toContain("customer_approval_status");
    expect(src).toContain("signOut");
  });

  it("the portal layout redirects unapproved customers", () => {
    const src = read("src/app/portal/layout.tsx");
    expect(src).toContain("getCustomerApproval");
    expect(src).toContain("/awaiting-approval");
  });

  it("only super_admin sees the Approvals nav item, and its page exists", () => {
    const item = ADMIN_NAV.flatMap((g) => g.items).find((i) => i.href === "/admin/customer-approvals");
    expect(item).toBeTruthy();
    expect(item?.roles).toEqual(["super_admin"]);
    expect(fs.existsSync(path.join(root, "src/app/admin/customer-approvals/page.tsx"))).toBe(true);
  });

  it("the approvals page and action are restricted to super_admin", () => {
    expect(read("src/app/admin/customer-approvals/page.tsx")).toContain('requirePageRoles(["super_admin"])');
    expect(read("src/app/admin/customer-approvals/actions.ts")).toContain('requireStaffRole(user, ["super_admin"])');
  });

  it("the migration enforces approval in the database", () => {
    const sql = read("supabase/migrations/017_customer_signup_approval.sql");
    expect(sql).toContain("approval_status = 'approved'");
    expect(sql).toContain("function public.owns_service_address");
    expect(sql).toContain("function public.customer_id");
    expect(sql).toContain("Only a super admin can review customer sign-ups");
    expect(sql).toContain("guard_customer_approval_change");
  });

  it("self-signup can never insert an approved customer", () => {
    const sql = read("supabase/migrations/017_customer_signup_approval.sql");
    const fn = sql.slice(sql.indexOf("function public.handle_new_customer_signup"));
    expect(fn).toContain("'pending'");
    expect(fn).not.toMatch(/approval_status[^\n]*'approved'/);
  });

  it("the signup action never sends or trusts an approval status", () => {
    // Strip comments so the check covers code only.
    const code = read("src/app/signup/actions.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/approval_status|approved/i);
  });
});
