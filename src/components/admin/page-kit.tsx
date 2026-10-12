import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Database } from "@/types/database";

export type Enum<K extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][K];
export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{title}</h1>
        {description && <p className="text-sm text-neutral-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatusBadge({ value, tones }: { value: string; tones: Record<string, Tone> }) {
  return <Badge tone={tones[value] ?? "neutral"}>{value.replace(/_/g, " ")}</Badge>;
}

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
}

/** Table with consistent error and empty states. Rows come only from the database. */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  error,
  emptyMessage,
}: {
  columns: Column<T>[];
  rows: T[] | null;
  error?: { message: string } | null;
  emptyMessage: string;
}) {
  if (error) {
    return (
      <p className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">
        Could not load data: {error.message}
      </p>
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-neutral-500">{emptyMessage}</CardContent>
      </Card>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
          <tr>
            {columns.map((c) => (
              <th key={c.header} className={`px-4 py-2 ${c.align === "right" ? "text-right" : ""}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
              {columns.map((c) => (
                <td
                  key={c.header}
                  className={`px-4 py-2 text-neutral-700 ${c.align === "right" ? "text-right tabular-nums" : ""}`}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** GET-form filter bar: optional text search plus any number of select filters. */
export function FilterBar({
  search,
  selects = [],
}: {
  search?: { name: string; label: string; value?: string; placeholder?: string };
  selects?: { name: string; label: string; value?: string; options: string[] }[];
}) {
  return (
    <form method="GET" className="flex flex-wrap items-end gap-3">
      {search && (
        <div className="min-w-[200px]">
          <label htmlFor={search.name} className="mb-1 block text-xs font-medium text-neutral-600">
            {search.label}
          </label>
          <Input id={search.name} name={search.name} defaultValue={search.value ?? ""} placeholder={search.placeholder} />
        </div>
      )}
      {selects.map((s) => (
        <div key={s.name}>
          <label htmlFor={s.name} className="mb-1 block text-xs font-medium text-neutral-600">
            {s.label}
          </label>
          <select
            id={s.name}
            name={s.name}
            defaultValue={s.value ?? ""}
            className="h-9 rounded-md border border-neutral-300 bg-white px-2 text-sm"
          >
            <option value="">All</option>
            {s.options.map((o) => (
              <option key={o} value={o}>
                {o.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      ))}
      <Button type="submit" variant="outline">
        Filter
      </Button>
    </form>
  );
}

/** Narrows a free-text query param to a known enum value, or undefined. */
export function pick<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}
