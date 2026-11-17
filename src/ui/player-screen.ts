// Canvas dimensions and fullscreen behavior, shared by the player layout.
export const NATIVE_WIDTH = 640;
export const NATIVE_HEIGHT = 400;

/**
 * ネイティブの Fullscreen API が使えるか。
 *
 * iPhone の WebKit は <video> 以外の全画面表示に対応しておらず、
 * requestFullscreen も webkitRequestFullscreen も生えていない
 * (iPad は webkit 版を持つ)。iOS版 Chrome も中身は WebKit なので同じ。
 * 呼んでも例外すら出ずに何も起きないため、事前に判定して代替へ倒す。
 */
export function nativeFullscreenSupported(el: HTMLElement): boolean {
  const withWebkit = el as HTMLElement & { webkitRequestFullscreen?: () => void };
  const doc = document as Document & { webkitFullscreenEnabled?: boolean };
  const hasMethod =
    typeof el.requestFullscreen === 'function' || typeof withWebkit.webkitRequestFullscreen === 'function';
  const enabled = document.fullscreenEnabled ?? doc.webkitFullscreenEnabled ?? false;
  return hasMethod && enabled;
}

/**
 * ネイティブ全画面の対象は「ページ全体」でなければならない。
 *
 * canvas だけを requestFullscreen すると、その部分木の外にある要素は一切
 * 描画されない。バーチャルパッドは sides配置のとき document.body 直下へ
 * 移すので、canvas を対象にすると Android で画面だけが出てパッドも
 * ツールバーも消える(2026-08-20 実機で発覚)。
 */
export function fullscreenRoot(): HTMLElement {
  return document.documentElement;
}

export function nativeFullscreenActive(): boolean {
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  return Boolean(document.fullscreenElement ?? doc.webkitFullscreenElement);
}

export async function enterNativeFullscreen(el: HTMLElement): Promise<void> {
  const withWebkit = el as HTMLElement & { webkitRequestFullscreen?: () => void };
  if (typeof el.requestFullscreen === 'function') await el.requestFullscreen();
  else withWebkit.webkitRequestFullscreen?.();
}

export async function exitNativeFullscreen(): Promise<void> {
  const doc = document as Document & { webkitExitFullscreen?: () => void };
  if (typeof document.exitFullscreen === 'function') await document.exitFullscreen();
  else doc.webkitExitFullscreen?.();
}

/**
 * 現在コアが出力している画面サイズ。
 *
 * PC-98 は 640x400 だけでなく 640x480(31kHz/480ライン) にも切り替わり、
 * NP2kai はそのとき SDL_SetWindowSize() で canvas の width/height 属性を
 * 書き換える。UI 側が 640x400 決め打ちのままだと CSS サイズが 400 基準で
 * 残るため縦に潰れて表示され、マウス座標も 480/400 = 1.2 倍ずれる。
 * 属性値を唯一の真実として参照する。
 */
export function nativeSize(canvas: HTMLCanvasElement): { w: number; h: number } {
  return {
    w: canvas.width > 0 ? canvas.width : NATIVE_WIDTH,
    h: canvas.height > 0 ? canvas.height : NATIVE_HEIGHT,
  };
}

