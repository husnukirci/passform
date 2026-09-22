import { z } from "zod";

export interface CategoryNode {
  /** The slug, e.g. `brakes/pads`. */
  id: string;
  name: string;
  children: CategoryNode[];
}

/** Recursive, so the type is declared by hand and the schema is annotated with it. */
export const CategoryNode: z.ZodType<CategoryNode> = z.object({
  id: z.string(),
  name: z.string(),
  children: z.array(z.lazy(() => CategoryNode)),
});

export const CategoriesResponse = z.object({ categories: z.array(CategoryNode) });
export type CategoriesResponse = z.infer<typeof CategoriesResponse>;
