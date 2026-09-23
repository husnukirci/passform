import { ErrorResponse } from "@passform/contracts";
import type { ZodType } from "zod";

/**
 * The only path from the web app to the backend: HTTP calls to the API,
 * with every response body parsed against its `@passform/contracts` schema.
 * Works on the server (RSC) and in the browser (client islands) alike.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(ApiError.describe(status, body));
    this.name = "ApiError";
  }

  /** The API's own message when the body is an `ErrorResponse`, else the status. */
  static describe(status: number, body: unknown): string {
    const parsed = ErrorResponse.safeParse(body);
    return parsed.success ? parsed.data.message : `API request failed with status ${status}`;
  }
}

export interface ApiResult<T> {
  status: number;
  data: T;
}

/** Like `apiFetch` but keeps the HTTP status, which the order flow shows (201 vs 200). */
export async function apiRequest<T>(
  path: string,
  schema: ZodType<T>,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const response = await fetch(`${API_URL}${path}`, { cache: "no-store", ...init });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, body);
  }

  return { status: response.status, data: schema.parse(body) };
}

export async function apiFetch<T>(
  path: string,
  schema: ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  return (await apiRequest(path, schema, init)).data;
}

/** A JSON body plus any extra headers, for the POST endpoints. */
export function jsonInit(body: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  };
}

/** One line to show a visitor for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
