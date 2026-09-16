import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "activity-photos";

export interface ActivityPhoto {
  id: string;
  storage_path: string;
  /** Local object URL (blob) — safe to draw on a canvas without tainting it. */
  url: string;
}

/** Downscale an image file to keep uploads small. */
async function downscale(file: File, maxEdge = 1600, quality = 0.85): Promise<Blob> {
  try {
    const bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(objectUrl); resolve(img); };
      img.onerror = (e) => { URL.revokeObjectURL(objectUrl); reject(e); };
      img.src = objectUrl;
    });
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no ctx");
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) throw new Error("toBlob failed");
    return blob;
  } catch {
    return file;
  }
}

export function useActivityPhotos(activityId: string | null, source = "strava") {
  const [photos, setPhotos] = useState<ActivityPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const urlsRef = useRef<string[]>([]);

  const revokeAll = useCallback(() => {
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    urlsRef.current = [];
  }, []);

  const load = useCallback(async () => {
    if (!activityId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("activity_photos")
        .select("id, storage_path")
        .eq("activity_id", activityId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = data || [];
      const resolved: ActivityPhoto[] = [];
      for (const row of rows) {
        const { data: file } = await supabase.storage.from(BUCKET).download(row.storage_path);
        if (!file) continue;
        const url = URL.createObjectURL(file);
        urlsRef.current.push(url);
        resolved.push({ id: row.id, storage_path: row.storage_path, url });
      }
      revokeAll_keepCurrent(resolved);
      setPhotos(resolved);
    } finally {
      setLoading(false);
    }
    // Revoke urls that are no longer referenced.
    function revokeAll_keepCurrent(next: ActivityPhoto[]) {
      const keep = new Set(next.map((p) => p.url));
      urlsRef.current = urlsRef.current.filter((u) => {
        if (keep.has(u)) return true;
        URL.revokeObjectURL(u);
        return false;
      });
    }
  }, [activityId]);

  useEffect(() => {
    setPhotos([]);
    revokeAll();
    void load();
    return () => revokeAll();
  }, [activityId, load, revokeAll]);

  const upload = useCallback(
    async (files: File[]) => {
      if (!activityId || files.length === 0) return;
      setUploading(true);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) throw new Error("not signed in");
        for (const file of files) {
          const blob = await downscale(file);
          const path = `${uid}/${activityId}/${crypto.randomUUID()}.jpg`;
          const { error: upErr } = await supabase.storage
            .from(BUCKET)
            .upload(path, blob, { contentType: "image/jpeg", upsert: false });
          if (upErr) throw upErr;
          const { error: rowErr } = await supabase.from("activity_photos").insert({
            user_id: uid,
            activity_id: activityId,
            source,
            storage_path: path,
            sort_order: photos.length,
          });
          if (rowErr) throw rowErr;
        }
        await load();
      } finally {
        setUploading(false);
      }
    },
    [activityId, source, photos.length, load],
  );

  const remove = useCallback(
    async (photo: ActivityPhoto) => {
      await supabase.storage.from(BUCKET).remove([photo.storage_path]);
      await supabase.from("activity_photos").delete().eq("id", photo.id);
      await load();
    },
    [load],
  );

  return { photos, loading, uploading, upload, remove, reload: load };
}
