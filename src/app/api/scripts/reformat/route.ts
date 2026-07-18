import { NextRequest } from "next/server";
import mammoth from "mammoth";
import { getContext } from "@/lib/ownership";
import { can, isStaff } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase";
import { reformatToScript } from "@/lib/ai";

// Turn an uploaded doc into a formatted script. Extracts the text, hands it to
// Claude to reshape into the app's script format, and returns it — the client
// drops it into the editor for review. NOTHING is saved here; saving stays an
// explicit human step (PUT /api/scripts/[id] or POST /api/scripts).
export const maxDuration = 60; // the Claude reshape can take ~15-30s

const MAX_BYTES = 2 * 1024 * 1024; // 2MB — business notes are small; cap abuse

export async function POST(request: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(ctx.user.role, "scripts")) return Response.json({ error: "Not found" }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const businessId = String(form?.get("business_id") ?? "");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file was uploaded." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "File is too large (max 2 MB)." }, { status: 413 });
  }

  // Resolve the business name for personalization, and prove ownership.
  let businessName = "your business";
  if (businessId) {
    const { data: biz } = await supabaseAdmin
      .from("businesses")
      .select("name, client_id")
      .eq("id", businessId)
      .maybeSingle<{ name: string; client_id: string }>();
    if (!biz || (!isStaff(ctx.user.role) && biz.client_id !== ctx.user.id)) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    businessName = biz.name;
  }

  // Extract plain text. txt/md are read directly; docx via mammoth. Anything else
  // is refused rather than fed to the model as garbage.
  const lower = file.name.toLowerCase();
  let sourceText = "";
  try {
    if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".markdown")) {
      sourceText = await file.text();
    } else if (lower.endsWith(".docx")) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await mammoth.extractRawText({ buffer });
      sourceText = result.value;
    } else {
      return Response.json(
        { error: "Unsupported file type. Upload a .txt, .md, or .docx file." },
        { status: 400 }
      );
    }
  } catch (err) {
    return Response.json(
      { error: `Could not read that file: ${(err as Error).message}` },
      { status: 400 }
    );
  }

  if (!sourceText.trim()) {
    return Response.json({ error: "That file appears to be empty." }, { status: 400 });
  }

  try {
    const content = await reformatToScript(sourceText, businessName);
    return Response.json({ content });
  } catch (err) {
    return Response.json(
      { error: `Reformatting failed: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}
