"use client";

import { CreateImportResponse, ImportStatusResponse, SuppliersResponse } from "@passform/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useId } from "react";

import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import { API_URL, apiFetch, errorMessage, jsonInit } from "@/lib/api";
import { formatCount, formatDateTime } from "@/lib/format";

/** The file `npm run data:generate-import -- --rows 2500` writes; the input is editable. */
const DEFAULT_PATH = "imports/s_01-2500.jsonl";

export function ImportsView() {
  const router = useRouter();
  const importId = useSearchParams().get("id");
  const ids = { supplier: useId(), path: useId() };

  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => apiFetch("/suppliers", SuppliersResponse),
  });

  const start = useMutation({
    mutationFn: (body: { supplierId: string; path: string }) =>
      apiFetch("/imports", CreateImportResponse, jsonInit(body)),
    onSuccess: ({ importId: id }) => router.replace(`/imports?id=${encodeURIComponent(id)}`),
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    start.mutate({
      supplierId: String(form.get("supplierId") ?? ""),
      path: String(form.get("path") ?? "").trim(),
    });
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={onSubmit}
        className="space-y-3 rounded-lg border border-border bg-surface p-4 text-sm"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col" htmlFor={ids.supplier}>
            Supplier
            <select
              id={ids.supplier}
              name="supplierId"
              required
              disabled={!suppliers.data}
              className="mt-1 rounded border border-border bg-background px-2 py-1 disabled:opacity-60"
            >
              {suppliers.data?.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.id} · {supplier.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-64 flex-1 flex-col" htmlFor={ids.path}>
            File, relative to DATA_DIR
            <input
              id={ids.path}
              name="path"
              defaultValue={DEFAULT_PATH}
              required
              className="mt-1 rounded border border-border bg-background px-2 py-1 font-mono"
            />
          </label>
          <button
            type="submit"
            disabled={start.isPending || !suppliers.data}
            className="rounded bg-accent px-4 py-1.5 font-medium text-accent-fg disabled:opacity-60"
          >
            {start.isPending ? "Starting…" : "Start import"}
          </button>
        </div>
        {(start.isError || suppliers.isError) && (
          <p role="alert" className="text-fit-no">
            {errorMessage(start.error ?? suppliers.error)}
          </p>
        )}
        <p className="text-muted">
          Generate a file with{" "}
          <code className="font-mono">npm run data:generate-import -- --rows 2500</code>. Queues and
          dead letters:{" "}
          <a href={`${API_URL}/admin/queues`} className="text-link underline">
            Bull Board
          </a>
          .
        </p>
      </form>

      {importId && <ImportStatusCard importId={importId} />}
    </div>
  );
}

const TERMINAL = new Set<ImportStatusResponse["status"]>(["completed", "partial", "failed"]);

const TONE: Record<ImportStatusResponse["status"], StatusTone> = {
  queued: "warn",
  running: "warn",
  completed: "ok",
  partial: "warn",
  failed: "fail",
};

function ImportStatusCard({ importId }: { importId: string }) {
  const status = useQuery({
    queryKey: ["import", importId],
    queryFn: () => apiFetch(`/imports/${encodeURIComponent(importId)}`, ImportStatusResponse),
    refetchInterval: (query) =>
      query.state.data && TERMINAL.has(query.state.data.status) ? false : 2000,
  });

  if (status.isPending) {
    return (
      <p className="text-sm text-muted" aria-busy="true">
        Loading import {importId}…
      </p>
    );
  }
  if (status.isError) {
    return (
      <p role="alert" className="text-sm text-fit-no">
        {errorMessage(status.error)}
      </p>
    );
  }

  const data = status.data;
  const percent =
    data.totalRows === 0 ? 0 : Math.round((data.processedRows / data.totalRows) * 100);

  return (
    <section
      aria-labelledby="import-heading"
      className="space-y-3 rounded-lg border border-border p-4 text-sm"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="import-heading" className="font-semibold">
          Import <span className="font-mono">{data.id}</span>
        </h2>
        <StatusBadge tone={TONE[data.status]}>{data.status}</StatusBadge>
        <span className="text-muted" aria-live="polite">
          {formatCount(data.processedRows)} of {formatCount(data.totalRows)} rows · {percent}%
        </span>
      </div>

      <div
        role="progressbar"
        aria-label="Rows processed"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-3 overflow-hidden rounded bg-surface"
      >
        {/* Width is computed geometry, the one place an inline style is allowed. */}
        <div className="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
        <dt className="text-muted">Rows rejected</dt>
        <dd>{formatCount(data.failedRows)}</dd>
        <dt className="text-muted">Chunks pending</dt>
        <dd>{formatCount(data.chunks.pending)}</dd>
        <dt className="text-muted">Chunks done</dt>
        <dd>{formatCount(data.chunks.done)}</dd>
        <dt className="text-muted">Chunks failed</dt>
        <dd>{formatCount(data.chunks.failed)}</dd>
        <dt className="text-muted">Started</dt>
        <dd>{data.startedAt ? formatDateTime(data.startedAt) : "—"}</dd>
        <dt className="text-muted">Finished</dt>
        <dd>{data.finishedAt ? formatDateTime(data.finishedAt) : "—"}</dd>
      </dl>

      {data.error && (
        <p role="alert" className="text-fit-no">
          {data.error.message}
        </p>
      )}
      {data.status === "partial" && (
        <p>
          Some rows were rejected or a chunk failed after every retry; the failed chunk sits in the
          dead-letter queue with its rows attached. Everything else is in.
        </p>
      )}
      {(data.status === "completed" || data.status === "partial") && (
        <p className="text-muted">
          An index rebuild is queued behind the import and swaps the alias when its counts match.
        </p>
      )}
    </section>
  );
}
