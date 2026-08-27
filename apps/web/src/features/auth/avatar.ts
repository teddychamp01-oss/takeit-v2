// Client-side avatar compression (SPEC C6: low-end-first, small payloads,
// no video ever). Canvas resize to <=512px on the longest side, re-encoded
// as JPEG — whatever the input format was, the uploaded bytes are always a
// small raster JPEG. Browser API code — the pure sizing/validation rules it
// relies on live (tested) in validation.ts.

import { AVATAR_MAX_DIMENSION, computeResizeDims } from './validation';

const JPEG_QUALITY = 0.82;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('avatar_decode_failed'));
    img.src = url;
  });
}

/**
 * Decode → resize (never upscale) → JPEG-encode. Throws on undecodable input
 * or a broken canvas; callers surface auth.errorAvatarProcess.
 * (Modern browsers apply EXIF orientation during decode by default.)
 */
export async function compressAvatar(file: Blob): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const { width, height } = computeResizeDims(
      img.naturalWidth,
      img.naturalHeight,
      AVATAR_MAX_DIMENSION,
    );
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('avatar_canvas_unavailable');
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob) throw new Error('avatar_encode_failed');
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
