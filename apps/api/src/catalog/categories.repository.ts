import { Inject, Injectable } from "@nestjs/common";
import type { CategoryNode } from "@passform/contracts";
import { asc } from "drizzle-orm";

import { type Db } from "../infra/db/client.js";
import { DB } from "../infra/db/db.module.js";
import { categories } from "../infra/db/schema.js";

export interface CategoryRow {
  id: string;
  name: string;
  parentId: string | null;
}

@Injectable()
export class CategoriesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The whole tree from one query; the table is small (under a hundred rows). */
  async tree(): Promise<CategoryNode[]> {
    const rows = await this.db.select().from(categories).orderBy(asc(categories.name));
    return assembleTree(rows);
  }
}

/** Nests rows under their parents, keeping the input order among siblings. */
export function assembleTree(rows: readonly CategoryRow[]): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>(
    rows.map((row) => [row.id, { id: row.id, name: row.name, children: [] }]),
  );
  const roots: CategoryNode[] = [];
  for (const row of rows) {
    const node = nodes.get(row.id);
    const parent = row.parentId === null ? undefined : nodes.get(row.parentId);
    if (node === undefined) continue;
    if (parent === undefined) roots.push(node);
    else parent.children.push(node);
  }
  return roots;
}
