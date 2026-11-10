import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const MAX_SIDE = 2048;

/**
 * Re-encode a picked photo as a JPEG before upload.
 *
 * iPhones hand back HEIC, which Chrome, Firefox and Edge can't display, so a
 * photo added on the phone would show as a blank tile on the web app. JPEG
 * renders everywhere. Large photos are also scaled to fit within 2048px.
 * If the conversion fails we fall back to the original file.
 */
export async function toWebSafeJpeg(
  uri: string,
  size?: { width?: number; height?: number },
): Promise<{ uri: string; converted: boolean }> {
  try {
    const ctx = ImageManipulator.manipulate(uri);
    const w = size?.width ?? 0;
    const h = size?.height ?? 0;
    if (Math.max(w, h) > MAX_SIDE) {
      ctx.resize(w >= h ? { width: MAX_SIDE } : { height: MAX_SIDE });
    }
    const ref = await ctx.renderAsync();
    const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });
    return { uri: out.uri, converted: true };
  } catch {
    return { uri, converted: false };
  }
}
