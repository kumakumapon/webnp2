export type DroppedKind = 'hdd' | 'fd' | 'archive';

const HDD_EXTENSIONS = ['.thd', '.hdi', '.nhd', '.hdd'];
// NP2kai本体(NP2kai/sdl/np2.c の np2_isfdimage())が受け付けるFD拡張子に準拠。
// 実測(2026-08-13): .TFD 2枚入りZIPが「圧縮ファイル内にディスクイメージが見つかりません
// でした」になった原因はこのリストが本体より狭かったこと。
// .bin だけは意図的に除外する: 汎用的すぎて、ZIP同梱のROM/その他バイナリを誤ってFDと
// 判定してしまう(コア本体はコマンドライン単体指定のみを想定しており、ZIP展開時の
// 誤爆リスクをコアほど許容できない)。
const FD_EXTENSIONS = [
  '.d88',
  '.d98',
  '.fdi',
  '.hdm',
  '.xdf',
  '.dup',
  '.2hd',
  '.nfd',
  '.fdd',
  '.hd4',
  '.hd5',
  '.hd9',
  '.h01',
  '.hdb',
  '.ddb',
  '.dd6',
  '.dd9',
  '.dcp',
  '.dcu',
  '.flp',
  '.tfd',
  '.fim',
  '.img',
  '.ima',
];
const ARCHIVE_EXTENSIONS = ['.zip', '.lzh'];
/** ファイル選択ダイアログのaccept属性(ディスクイメージ + 圧縮ファイル)。 */
export const HDD_INPUT_ACCEPT = HDD_EXTENSIONS.join(',');
export const FD_INPUT_ACCEPT = [...FD_EXTENSIONS, ...ARCHIVE_EXTENSIONS].join(',');

/** ディスクイメージの種別を拡張子から判定する。アーカイブは対象外(nullを返す)。 */
export function classifyDiskKind(name: string): 'hdd' | 'fd' | null {
  const lower = name.toLowerCase();
  if (HDD_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'hdd';
  if (FD_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'fd';
  return null;
}

/** ドロップ/選択されたファイルの受付種別。ディスクイメージに加えZIP/LZHも受け付ける。 */
export function classifyDroppedInput(name: string): DroppedKind | null {
  const lower = name.toLowerCase();
  if (ARCHIVE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'archive';
  return classifyDiskKind(name);
}
