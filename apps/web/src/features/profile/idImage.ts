// Client-side compression for manual-ID document photos (SPEC C6: low-end
// first, small payloads, no video). Canvas resize to <=1600px on the longest
// side — larger than avatars because the ops reviewer must be able to READ
// the document — re-encoded as JPEG. Browser API code; the pure sizing and
// validation rules it relies on live (tested) in logic.ts.

import { fitWithin, ID_IMAGE_MAX_DIMENSION } from './logic';

const JPEG_QUALITY = 0.8;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('id_image_decode_failed'));
    img.src = url;
  });
}

/**
 * Decode → resize (never upscale) → JPEG-encode. Throws on undecodable input
 * or a broken canvas; callers surface verification.processError.
 * (Modern browsers apply EXIF orientation during decode by default.)
 */
export async function compressIdImage(file: Blob): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const { width, height } = fitWithin(
      img.naturalWidth,
      img.naturalHeight,
      ID_IMAGE_MAX_DIMENSION,
    );
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('id_image_canvas_unavailable');
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob) throw new Error('id_image_encode_failed');
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
