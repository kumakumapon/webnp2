// Disk file text/binary encoding and DOS destination-name validation.
import { encodeSjisUnits } from './sjis.ts';
import { DiskError } from './fat.ts';

/**
 * ディスク書き込み用テキストエンコーダ。ASCIIはそのまま、改行は 0x0D 0x0A (CRLF) に、
 * それ以外は encodeSjisUnits で1文字ずつ Shift_JIS へ変換する。
 * encodeSjisUnits 自体は改行を 0x0D 単体(Enterキー注入用)に変換するため、
 * ディスクファイル向けにはここで改行だけ別扱いする。
 * (bridge.ts の disk_write_file / put_file 双方から使う共通実装)
 */
export function encodeTextForDisk(content: string): { bytes: Uint8Array; skipped: string[] } {
  const out: number[] = [];
  const skipped: string[] = [];
  const chars = Array.from(content);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === '\r') {
      if (chars[i + 1] === '\n') continue; // 次のループで\nとしてCRLFを積む
      out.push(0x0d, 0x0a);
      continue;
    }
    if (ch === '\n') {
      out.push(0x0d, 0x0a);
      continue;
    }
    const { units, skipped: sk } = encodeSjisUnits(ch);
    if (units.length > 0) out.push(...units[0]);
    skipped.push(...sk);
  }
  return { bytes: new Uint8Array(out), skipped };
}

/** Uint8Array を base64 文字列へ変換する(チャンク分割でスタック超過を回避)。 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** base64 文字列を Uint8Array へ変換する。 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** ゲスト側の宛先/取得元パス末尾からファイル名を取り出し、8.3形式であることを検証する。 */
export function extractAndValidate83Basename(guestPath: string): string {
  const segments = guestPath.split(/[\\/]/).filter((s) => s.length > 0);
  const base = segments[segments.length - 1];
  if (!base) {
    throw new Error(`invalid guest path: ${guestPath}`);
  }
  if (!/^[A-Za-z0-9_\-$~!#%'@(){}^]{1,8}(\.[A-Za-z0-9_\-$~!#%'@(){}^]{1,3})?$/.test(base)) {
    throw new DiskError(
      'invalidShortName',
      `ファイル名は8.3形式にしてください(2バイト文字/長い名前は不可): ${base}`,
      { name: base },
    );
  }
  return base;
}

