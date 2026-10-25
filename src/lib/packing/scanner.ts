"use client";

/**
 * Baca barcode dari <video> yang sama dengan rekaman (kamera tidak dibuka dua kali).
 * Pakai BarcodeDetector bawaan browser kalau ada (Chrome Android), selain itu ZXing (Safari iOS).
 * Format: Code 128 & QR (+ Code 39 yang juga dipakai sebagian kurir).
 */

type Detector = (canvas: HTMLCanvasElement) => Promise<string | null>;

interface NativeBarcodeDetector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: {
      new (opts: { formats: string[] }): NativeBarcodeDetector;
      getSupportedFormats(): Promise<string[]>;
    };
  }
}

async function nativeDetector(): Promise<Detector | null> {
  const BD = window.BarcodeDetector;
  if (!BD) return null;
  try {
    const supported = await BD.getSupportedFormats();
    const formats = ["code_128", "qr_code", "code_39"].filter((f) => supported.includes(f));
    if (!formats.includes("code_128") || !formats.includes("qr_code")) return null;
    const detector = new BD({ formats });
    return async (canvas) => (await detector.detect(canvas))[0]?.rawValue ?? null;
  } catch {
    return null;
  }
}

async function zxingDetector(): Promise<Detector> {
  const zx = await import("@zxing/library");
  const hints = new Map();
  hints.set(zx.DecodeHintType.POSSIBLE_FORMATS, [zx.BarcodeFormat.CODE_128, zx.BarcodeFormat.QR_CODE, zx.BarcodeFormat.CODE_39]);
  hints.set(zx.DecodeHintType.TRY_HARDER, true);
  const reader = new zx.MultiFormatReader();
  reader.setHints(hints);
  return async (canvas) => {
    try {
      const source = new zx.HTMLCanvasElementLuminanceSource(canvas);
      return reader.decodeWithState(new zx.BinaryBitmap(new zx.HybridBinarizer(source))).getText();
    } catch {
      return null; // NotFoundException: tidak ada barcode di frame ini
    }
  };
}

export interface Scanner {
  engine: "native" | "zxing";
  stop: () => void;
}

/**
 * Mulai memindai frame video (area tengah sesuai bingkai scan). `onCode` dipanggil untuk tiap kode terbaca;
 * penyaringan bacaan ganda dilakukan di scan-rules.
 */
export async function startScanner(video: HTMLVideoElement, onCode: (code: string) => void): Promise<Scanner> {
  const native = await nativeDetector();
  const detect = native ?? (await zxingDetector());
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = async () => {
    if (stopped) return;
    if (video.readyState >= 2 && video.videoWidth > 0) {
      // Potong area tengah (lebar 85%, tinggi 45%) lalu perkecil ke maks 720px supaya cepat
      const sw = video.videoWidth * 0.85;
      const sh = video.videoHeight * 0.45;
      const scale = Math.min(1, 720 / sw);
      canvas.width = Math.round(sw * scale);
      canvas.height = Math.round(sh * scale);
      ctx.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
      const code = await detect(canvas).catch(() => null);
      if (code && !stopped) onCode(code);
    }
    if (!stopped) timer = setTimeout(tick, native ? 120 : 200);
  };
  void tick();

  return {
    engine: native ? "native" : "zxing",
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
