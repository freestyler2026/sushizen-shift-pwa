/**
 * Shrink a photo in the browser before it is uploaded.
 *
 * Uploads go through a Vercel function, and Vercel rejects any request body
 * over ~4.3 MB with a plain-text 413 that never reaches our code. A phone
 * photo of an invoice is routinely 4-8 MB, so without this the upload fails
 * on exactly the devices the feature is meant for.
 *
 * An invoice only has to be readable, so a 2000px long edge is plenty and
 * lands well under the limit — usually 300-800 KB.
 */

/** Comfortably under Vercel's ~4.3 MB request ceiling, leaving room for the
 *  multipart envelope and the other form fields. */
export const UPLOAD_LIMIT_BYTES = 3_800_000;

const MAX_EDGE = 2000;

export function formatBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`;
  return `${Math.round(n / 1000)} KB`;
}

async function draw(file: File, maxEdge: number, quality: number): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
    );
  } finally {
    bitmap.close();
  }
}

/**
 * Returns a file small enough to upload, or throws with a message meant for
 * the person holding the phone.
 *
 * PDFs cannot be redrawn here, so an oversized one is reported rather than
 * silently failing later.
 */
export async function prepareUpload(file: File): Promise<File> {
  if (file.type === "application/pdf") {
    if (file.size > UPLOAD_LIMIT_BYTES) {
      throw new Error(
        `This PDF is ${formatBytes(file.size)}. The limit is ${formatBytes(UPLOAD_LIMIT_BYTES)} — ` +
          `please take a photo of the invoice instead.`,
      );
    }
    return file;
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Only a photo or a PDF can be uploaded.");
  }

  // Small enough already — don't re-encode and lose quality for nothing.
  if (file.size <= UPLOAD_LIMIT_BYTES / 2) return file;

  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  for (const [edge, quality] of [[MAX_EDGE, 0.82], [1600, 0.75], [1200, 0.7]] as const) {
    const blob = await draw(file, edge, quality);
    if (blob && blob.size <= UPLOAD_LIMIT_BYTES) {
      return new File([blob], name, { type: "image/jpeg" });
    }
  }
  throw new Error(
    `This photo is ${formatBytes(file.size)} and could not be made small enough. ` +
      `Please retake it at a lower resolution.`,
  );
}

/**
 * Read an error out of a response that may not be JSON. Vercel's 413 is plain
 * text, so calling res.json() on it throws and the real reason is lost.
 */
export async function readError(res: Response, fallback: string): Promise<string> {
  if (res.status === 413) {
    return `The file is too large to upload. Please use a smaller photo (under ${formatBytes(UPLOAD_LIMIT_BYTES)}).`;
  }
  const text = await res.text().catch(() => "");
  try {
    const j = JSON.parse(text);
    return String(j?.detail || j?.error || fallback);
  } catch {
    return text.trim().slice(0, 200) || fallback;
  }
}
