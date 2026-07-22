import { NextRequest, NextResponse } from "next/server";
import { getAdminApiContext } from "@/lib/api-auth";
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
} from "@/lib/validation";
import { extractMenu } from "@/lib/extraction/providers";

export const runtime = "nodejs";

// POST /api/uploads
// Accepts a menu file (multipart/form-data, field "file"), validates it, stores
// the original securely in the private "menu-uploads" bucket, then runs the
// (mock or real) extractor and saves the draft. Never publishes automatically.
export async function POST(req: NextRequest) {
  const ctx = await getAdminApiContext();
  if (!ctx) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const { supabase, restaurantId } = ctx;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  // --- Validate type + size -------------------------------------------------
  const ext = ALLOWED_UPLOAD_TYPES[file.type];
  if (!ext) {
    return NextResponse.json(
      {
        error:
          "Unsupported file type. Please upload a PDF, JPG, PNG, CSV, XLSX, or DOCX.",
      },
      { status: 415 }
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "File is too large. Maximum size is 10 MB." },
      { status: 413 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const buffer = Buffer.from(bytes);

  // --- Store the original file securely ------------------------------------
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const path = `${restaurantId}/${Date.now()}-${safeName}`;

  const { error: storageError } = await supabase.storage
    .from("menu-uploads")
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });
  if (storageError) {
    return NextResponse.json(
      { error: "Could not store the file. Please try again." },
      { status: 500 }
    );
  }

  // --- Create the upload record (status: processing) ------------------------
  const { data: uploadRow, error: insertError } = await supabase
    .from("menu_uploads")
    .insert({
      restaurant_id: restaurantId,
      file_path: path,
      file_name: file.name.slice(0, 200),
      file_type: file.type,
      file_size: file.size,
      status: "processing",
    })
    .select("id")
    .single();

  if (insertError || !uploadRow) {
    return NextResponse.json(
      { error: "Could not create the upload record." },
      { status: 500 }
    );
  }

  // --- Run extraction (mock or real) ---------------------------------------
  try {
    const result = await extractMenu({
      fileName: file.name,
      mimeType: file.type,
      base64: buffer.toString("base64"),
    });

    await supabase
      .from("menu_uploads")
      .update({
        status: "extracted",
        extraction_provider: result.provider,
        extracted: result,
        extraction_notes: result.notes.join("\n"),
      })
      .eq("id", uploadRow.id);

    return NextResponse.json({ id: uploadRow.id, status: "extracted" });
  } catch (err) {
    // Keep the upload row; mark it failed so the admin can retry or add manually.
    await supabase
      .from("menu_uploads")
      .update({
        status: "failed",
        error: "Extraction failed. You can still build the menu manually.",
      })
      .eq("id", uploadRow.id);

    // Log server-side detail without leaking to the client.
    console.error("Menu extraction error:", err);
    return NextResponse.json(
      {
        id: uploadRow.id,
        status: "failed",
        error:
          "We stored your file but couldn't read it automatically. You can enter items manually.",
      },
      { status: 200 }
    );
  }
}
