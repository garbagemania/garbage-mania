"use server";

import { friendlyError } from "@/lib/friendly-error";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/rbac";

const REASONS = [
  "gate_locked",
  "customer_absent",
  "bin_not_out",
  "weather",
  "vehicle_issue",
  "other",
] as const;

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const coord = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z.number().min(min).max(max).optional(),
  );

const baseSchema = z.object({
  collectionId: z.string().uuid(),
  latitude: coord(-90, 90),
  longitude: coord(-180, 180),
});

function back(params: Record<string, string>): never {
  const safe = params.error ? { ...params, error: friendlyError(params.error) } : params;
  redirect(`/driver?${new URLSearchParams(safe).toString()}`);
}

async function driverContext() {
  const user = await requireAuthenticatedUser();
  requireRole(user, ["driver"]);
  return { user, supabase: createSupabaseServerClient() };
}

/** Driver has reached the stop (assigned -> in_progress). */
export async function markArrived(formData: FormData) {
  const { supabase } = await driverContext();
  const parsed = baseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back({ error: "Invalid request." });

  const { error } = await supabase.rpc("driver_record_collection", {
    p_collection_id: parsed.data.collectionId,
    p_action: "arrive",
    p_latitude: parsed.data.latitude,
    p_longitude: parsed.data.longitude,
  });
  if (error) back({ error: error.message });

  revalidatePath("/driver");
  back({ saved: "Arrival recorded." });
}

/**
 * Collected: the proof photo is mandatory. The file goes to the private
 * collection-evidence bucket under <collection_id>/ using the driver's own
 * session, so storage RLS (assigned driver only) applies.
 */
export async function markCollected(formData: FormData) {
  const { user, supabase } = await driverContext();
  const parsed = baseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back({ error: "Invalid request." });
  const v = parsed.data;

  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    back({ error: "A proof photo is required to mark a collection as collected." });
  }
  const ext = PHOTO_TYPES[photo.type];
  if (!ext) back({ error: "Proof must be a JPEG, PNG or WebP image." });
  if (photo.size > MAX_PHOTO_BYTES) back({ error: "Photo is too large (max 10 MB)." });

  const storagePath = `${v.collectionId}/${randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("collection-evidence")
    .upload(storagePath, photo, { contentType: photo.type, upsert: false });
  if (uploadError) back({ error: `Photo upload failed: ${uploadError.message}` });

  const { data: doc, error: docError } = await supabase
    .from("documents")
    .insert({
      storage_path: storagePath,
      file_name: photo.name || `proof.${ext}`,
      mime_type: photo.type,
      size_bytes: photo.size,
      uploaded_by: user.id,
    })
    .select("id")
    .single();
  if (docError || !doc) {
    await supabase.storage.from("collection-evidence").remove([storagePath]);
    back({ error: `Could not register photo: ${docError?.message ?? "unknown error"}` });
  }

  const { error } = await supabase.rpc("driver_record_collection", {
    p_collection_id: v.collectionId,
    p_action: "complete",
    p_document_id: doc.id,
    p_latitude: v.latitude,
    p_longitude: v.longitude,
  });
  if (error) back({ error: error.message });

  revalidatePath("/driver");
  back({ saved: "Collection recorded." });
}

/** Missed / failed: a reason is required. Rescheduling is done by operations. */
export async function markFailed(formData: FormData) {
  const { supabase } = await driverContext();
  const schema = baseSchema.extend({
    reason: z.enum(REASONS, { errorMap: () => ({ message: "Choose a reason." }) }),
    notes: z.string().trim().max(1000, "Notes are too long (max 1000 characters)").optional(),
  });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back({ error: parsed.error.issues[0]?.message ?? "Invalid request." });
  const v = parsed.data;

  const { error } = await supabase.rpc("driver_record_collection", {
    p_collection_id: v.collectionId,
    p_action: "fail",
    p_reason: v.reason,
    p_notes: v.notes || undefined,
    p_latitude: v.latitude,
    p_longitude: v.longitude,
  });
  if (error) back({ error: error.message });

  revalidatePath("/driver");
  back({ saved: "Missed collection recorded." });
}
