import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { ExtractionResult } from "@/lib/types";
import { ReviewForm } from "@/components/admin/ReviewForm";

// Server component: loads the extracted draft for this upload and hands it to
// the editable client form. Publishing happens via /api/uploads/[id]/publish.
export default async function ReviewPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdmin();
  const supabase = createClient();

  const { data: upload } = await supabase
    .from("menu_uploads")
    .select("id, file_name, status, extracted, extraction_notes")
    .eq("id", params.id)
    .maybeSingle();

  if (!upload) notFound();

  const extracted = (upload.extracted as ExtractionResult | null) ?? {
    provider: "none",
    categories: [],
    notes: ["No draft was produced. You can add items manually on the Menu page."],
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Review extracted menu</h1>
      <p className="mt-1 text-brand-muted">
        From <span className="font-medium">{upload.file_name}</span>. Correct
        anything below, then publish. Nothing goes live until you press Publish.
      </p>

      {extracted.notes?.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="font-semibold text-amber-900">Please double-check:</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-amber-900">
            {extracted.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      <ReviewForm uploadId={upload.id} initial={extracted} />
    </div>
  );
}
