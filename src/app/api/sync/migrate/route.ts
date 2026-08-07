import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/sync/server";

export const runtime = "nodejs";

/**
 * Applies 001_init.sql using Supabase SQL via the pg REST meta endpoint when available,
 * otherwise splits statements and runs through rpc exec if present.
 * Prefer running the SQL once in the Supabase SQL Editor if this fails.
 */
export async function POST() {
  try {
    const admin = getSupabaseAdmin();
    const sqlPath = path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "001_init.sql",
    );
    const sql = await readFile(sqlPath, "utf8");

    // Try PostgREST-friendly probe: if campaigns exists, migration already applied.
    const probe = await admin.from("campaigns").select("id").limit(1);
    if (!probe.error) {
      return NextResponse.json({ ok: true, status: "already_applied" });
    }

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
      process.env.SUPABASE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) {
      return NextResponse.json(
        { error: "SUPABASE_URL / SUPABASE_KEY manquants" },
        { status: 500 },
      );
    }

    // Supabase SQL endpoint (project database query) — works with service/secret key on many projects.
    const endpoints = [
      `${url}/pg/query`,
      `${url}/rest/v1/rpc/exec_sql`,
    ];

    let lastError = "Impossible d'appliquer la migration automatiquement";
    for (const endpoint of endpoints) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(
          endpoint.includes("rpc")
            ? { query: sql }
            : { query: sql },
        ),
      });
      if (res.ok) {
        return NextResponse.json({ ok: true, status: "applied", via: endpoint });
      }
      lastError = `${endpoint}: ${res.status} ${await res.text()}`;
    }

    // Fallback: return SQL for manual paste in Supabase SQL Editor.
    return NextResponse.json(
      {
        error: lastError,
        hint: "Colle supabase/migrations/001_init.sql dans le SQL Editor Supabase, puis réessaie.",
        sql,
      },
      { status: 503 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur migration" },
      { status: 500 },
    );
  }
}
