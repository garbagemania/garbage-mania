import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ADMIN_NAV, navForRole } from "@/config/admin-nav";
import { ROLES } from "@/types/roles";

const root = process.cwd();

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

describe("admin sidebar has no placeholders or dead links", () => {
  const items = ADMIN_NAV.flatMap((g) => g.items);

  it("every item has an /admin href", () => {
    for (const item of items) {
      expect(item.href, item.label).toMatch(/^\/admin\/[a-z-]+(\/[a-z-]+)*$/);
    }
  });

  it("every href has a real page file", () => {
    for (const item of items) {
      const file = path.join(root, "src/app", item.href, "page.tsx");
      expect(fs.existsSync(file), `${item.label} -> ${file}`).toBe(true);
    }
  });

  it("no two items share an href", () => {
    const hrefs = items.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("every item is visible to at least one role, and every role sees a nav", () => {
    for (const item of items) expect(item.roles.length, item.label).toBeGreaterThan(0);
    for (const role of ROLES) {
      if (role === "driver" || role === "customer") continue;
      expect(navForRole(role).length, role).toBeGreaterThan(0);
    }
  });

  it('no "Coming soon" text remains in admin code', () => {
    const files = [
      ...walk(path.join(root, "src/app/admin")),
      ...walk(path.join(root, "src/components/admin")),
      path.join(root, "src/config/admin-nav.ts"),
    ].filter((f) => /\.(ts|tsx)$/.test(f));
    for (const file of files) {
      expect(fs.readFileSync(file, "utf8").toLowerCase(), file).not.toContain("coming soon");
    }
  });
});

describe("finance role only sees finance in the sidebar", () => {
  it("every item the finance role sees is on the finance allow-list", async () => {
    const { financeCanAccessPath } = await import("@/types/roles");
    const items = navForRole("finance").flatMap((g) => g.items);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(financeCanAccessPath(item.href), item.href).toBe(true);
    }
  });

  it("finance sees no Overview, Customers, Service, Operations or System groups", () => {
    const labels = navForRole("finance").map((g) => g.label);
    expect(labels).toEqual(["Finance"]);
  });
});
