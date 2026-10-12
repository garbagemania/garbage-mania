import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PORTAL_NAV } from "@/config/portal-nav";

const root = process.cwd();
const portalDir = path.join(root, "src/app/portal");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

const portalSources = [
  ...walk(portalDir),
  ...walk(path.join(root, "src/components/portal")),
  path.join(root, "src/config/portal-nav.ts"),
].filter((f) => /\.(ts|tsx)$/.test(f));

/** Does a /portal URL resolve to some page.tsx, treating [param] folders as wildcards? */
function routeExists(href: string): boolean {
  const clean = (href.split("?")[0] ?? "").split("#")[0]!.replace(/\/$/, "");
  const parts = clean.split("/").filter(Boolean);
  let dir = path.join(root, "src/app");
  for (const part of parts) {
    const direct = path.join(dir, part);
    if (fs.existsSync(direct)) {
      dir = direct;
      continue;
    }
    const dynamic = fs.readdirSync(dir, { withFileTypes: true }).find((e) => e.isDirectory() && /^\[.+\]$/.test(e.name));
    if (!dynamic) return false;
    dir = path.join(dir, dynamic.name);
  }
  return fs.existsSync(path.join(dir, "page.tsx"));
}

describe("customer portal navigation", () => {
  it("every nav item points at a real /portal page", () => {
    for (const item of PORTAL_NAV) {
      expect(item.href, item.label).toMatch(/^\/portal(\/[a-z-]+)?$/);
      expect(routeExists(item.href), `${item.label} -> ${item.href}`).toBe(true);
    }
  });

  it("no two items share an href", () => {
    const hrefs = PORTAL_NAV.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("every /portal href written anywhere in portal source resolves to a page", () => {
    const pattern = /["'`](\/portal[a-zA-Z0-9/_\-[\]]*)(?:\?[^"'`]*)?["'`]/g;
    for (const file of portalSources) {
      const text = fs.readFileSync(file, "utf8");
      for (const match of Array.from(text.matchAll(pattern))) {
        const href = (match[1] ?? "").replace(/\$\{[^}]+\}/g, "x");
        expect(routeExists(href), `${path.relative(root, file)} -> ${href}`).toBe(true);
      }
    }
  });

  it("has no 'coming soon' or placeholder copy", () => {
    for (const file of portalSources) {
      const text = fs.readFileSync(file, "utf8");
      expect(text, path.relative(root, file)).not.toMatch(/coming soon|lorem ipsum|placeholder page|not implemented/i);
    }
  });

  it("does not post to the non-existent /auth/signout route", () => {
    for (const file of portalSources) {
      expect(fs.readFileSync(file, "utf8"), path.relative(root, file)).not.toContain("/auth/signout");
    }
  });

  it("does not hard-code money amounts", () => {
    for (const file of portalSources) {
      expect(fs.readFileSync(file, "utf8"), path.relative(root, file)).not.toMatch(/KES\s?\d/);
    }
  });
});
