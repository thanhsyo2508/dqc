import latinFontUrl from "@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff?url";
import vietnameseFontUrl from "@fontsource/noto-sans/files/noto-sans-vietnamese-400-normal.woff?url";

export interface PdfFontBytes {
  fontBytes: Uint8Array;
  fallbackFontBytes: Uint8Array;
}

let cachedFont: PdfFontBytes | undefined;

/** Loads Latin + Vietnamese subsets so PDF glyphs are complete in every viewer. */
export async function loadVietnameseFont(): Promise<PdfFontBytes> {
  if (cachedFont) return cachedFont;
  const [latinResponse, vietnameseResponse] = await Promise.all([fetch(latinFontUrl), fetch(vietnameseFontUrl)]);
  if (!latinResponse.ok || !vietnameseResponse.ok) {
    throw new Error(`Không tải được font PDF (${latinResponse.status}/${vietnameseResponse.status}).`);
  }
  cachedFont = {
    fontBytes: new Uint8Array(await latinResponse.arrayBuffer()),
    fallbackFontBytes: new Uint8Array(await vietnameseResponse.arrayBuffer()),
  };
  return cachedFont;
}
