"use client";

import { useMemo, useRef, useState } from "react";

import {
  MAX_MODELS,
  SUGGESTED_MODELS,
  incompatibility,
  modelInfo,
  shortName,
} from "@/lib/models";
import type { Pathway } from "@/lib/pathways";

/**
 * Choose one or more models: chips for the chosen ones, a search box that
 * suggests the supported models (with what each can and can't do) and takes
 * any TransformerLens name typed in. Models the pathway can't run on are
 * offered but disabled, with the reason.
 */
export function ModelPicker({
  value,
  onChange,
  pathway,
  max = MAX_MODELS,
  label = "Models",
}: {
  value: string[];
  onChange: (models: string[]) => void;
  pathway?: Pathway | null;
  max?: number;
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const full = value.length >= max;

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const suggested = SUGGESTED_MODELS.filter(
      (m) => !value.includes(m.id) && (!q || m.id.toLowerCase().includes(q)),
    ).map((m) => ({ id: m.id, reason: incompatibility(pathway, m.id) }));
    // A name no suggestion matches is offered as typed: the worker checks it loads.
    const typed = query.trim();
    const known = SUGGESTED_MODELS.some((m) => m.id.toLowerCase().includes(q)) || value.includes(typed);
    return typed && !known && /^[\w.\-/]+$/.test(typed)
      ? [...suggested, { id: typed, reason: incompatibility(pathway, typed) }]
      : suggested;
  }, [query, value, pathway]);
  const usable = options.filter((o) => !o.reason);

  function add(id: string) {
    if (full || value.includes(id) || incompatibility(pathway, id)) return;
    onChange([...value, id]);
    setQuery("");
    setHighlight(0);
    inputRef.current?.focus();
  }

  function remove(id: string) {
    onChange(value.filter((m) => m !== id));
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setHighlight((h) => (h + step + Math.max(usable.length, 1)) % Math.max(usable.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (usable.length) add(usable[Math.min(highlight, usable.length - 1)].id);
    } else if (e.key === "Backspace" && !query && value.length) {
      remove(value[value.length - 1]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <div
        className="flex min-h-8 flex-wrap items-center gap-1 rounded-md border border-zinc-800 bg-zinc-950 px-1.5 py-1"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((id) => {
          const reason = incompatibility(pathway, id);
          return (
            <span
              key={id}
              title={reason ?? id}
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-xs ${
                reason ? "bg-amber-500/15 text-amber-200" : "bg-zinc-800 text-zinc-200"
              }`}
            >
              {shortName(id)}
              <button
                type="button"
                aria-label={`Remove ${id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(id);
                }}
                className="text-zinc-500 hover:text-zinc-200"
              >
                ×
              </button>
            </span>
          );
        })}
        <label className="sr-only" htmlFor="model-search">
          {label}
        </label>
        <input
          id="model-search"
          ref={inputRef}
          value={query}
          disabled={full}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKey}
          placeholder={
            full ? (max === 1 ? "" : `${max} models max`)
              : value.length ? "add a model"
              : max === 1 ? "choose a model" : "choose models"
          }
          className="min-w-28 flex-1 bg-transparent px-1 py-0.5 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
        />
      </div>
      {open && !full && options.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full min-w-72 overflow-auto rounded-md border border-zinc-800 bg-zinc-950 py-1 shadow-lg">
          {options.map((o) => {
            const info = modelInfo(o.id);
            const active = !o.reason && usable[highlight]?.id === o.id;
            return (
              <li
                key={o.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(o.id);
                }}
                className={`px-2.5 py-1.5 text-xs ${
                  o.reason ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                } ${active ? "bg-zinc-800" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-zinc-100">{o.id}</span>
                  {info ? (
                    <span className="flex gap-1">
                      <Badge>{info.size}B</Badge>
                      {info.gated && <Badge title="Needs a Hugging Face token with the licence accepted">gated</Badge>}
                      {info.saes && <Badge title="Has published SAEs: feature_explain runs on it">SAEs</Badge>}
                    </span>
                  ) : (
                    <Badge title="Not one of the supported models; the worker checks it loads">custom</Badge>
                  )}
                </div>
                {o.reason && <div className="mt-0.5 text-amber-300/80">{o.reason}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Badge({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className="rounded border border-zinc-700 px-1 text-[10px] text-zinc-400">
      {children}
    </span>
  );
}
