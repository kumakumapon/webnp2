// ファイルマネージャUI (FTPクライアント風2ペイン)。
// ホスト(ブラウザ)⇔実行中FD/ライブラリ内FDイメージ間でファイルを出し入れする。
// 実際のディスクI/OはWebNP2(main.ts経由のコールバック)に委譲し、このモジュールは
// DOM構築・ステージング管理・アーカイブ展開・8.3名変換・転送フローのみを担当する。

import { describeError, t } from './strings.ts';
import type { FatEntry } from '../api/fat.ts';
import { isArchive, extractArchive } from '../api/archive.ts';

/** 転送先/転送元として選択できる1件(実行中スロット or ライブラリ内イメージ)。 */
export interface FmTarget {
  kind: 'slot' | 'library';
  /** kind='slot': 'fd1'|'fd2'。kind='library': IndexedDBのsourceKey。 */
  ref: string;
  /** kind='slot'のときのみ有効。 */
  drive?: 1 | 2;
  /** スロット一覧を取得したときの媒体。挿し替え後の別媒体への書込みを防ぐ。 */
  sourceKey?: string;
  /** マウント中/ライブラリ上の実ファイル名。未マウントスロットはundefined。 */
  name?: string;
  /** ライブラリ側のエントリが、いずれかの実行中スロットにマウント中かどうか。 */
  mounted: boolean;
  /** FAT12/16として読み書きできるか(D88/HDD等の非対応イメージはfalse)。 */
  editable: boolean;
}

/** filemanager.ts が main.ts 側(WebNP2/IndexedDB)へ委譲する操作。PlayerCallbacksパターンに合わせる。 */
export interface FileManagerCallbacks {
  listTargets(): Promise<FmTarget[]>;
  listDir(target: FmTarget, path: string): Promise<{ entries: FatEntry[]; free: number; total: number }>;
  readFile(target: FmTarget, path: string): Promise<Uint8Array>;
  writeFile(target: FmTarget, path: string, data: Uint8Array): Promise<void>;
  deleteFile(target: FmTarget, path: string): Promise<void>;
  makeDir(target: FmTarget, path: string): Promise<void>;
  /** 未フォーマットではなくFAT12フォーマット済みの転送用FDを新規生成し、IndexedDBへ保存する。 */
  createTransferFd(desiredName: string): Promise<{ sourceKey: string; name: string }>;
}

export interface FileManagerDialog {
  open(): void;
  /** 言語切替時、ダイアログ内の表示文言・一覧を現在の言語で再構築する。 */
  applyStrings(): void;
}

/** ステージング(ホスト側)1件。アーカイブ展開後のエントリも同じ形で保持する。 */
interface StagedItem {
  id: number;
  name: string;
  size: number;
  data: Uint8Array;
  /** 展開元アーカイブ名。トップレベルから直接追加したファイルはundefined。 */
  group?: string;
}

interface StagedError {
  id: number;
  group: string;
  message: string;
}

type DiskSortKey = 'name' | 'size' | 'mtime';
const TRANSFER_DRAG_TYPE = 'application/x-webnp2-file-transfer';
type TransferDrag =
  | { from: 'host'; ids: number[] }
  | { from: 'disk'; names: string[]; target: FmTarget; path: string };

let nextStagedId = 1;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const child of children) node.append(child);
  return node;
}

function formatSize(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

// webnp2.ts の extractAndValidate83Basename と同じ8.3許容文字集合。
const VALID_83_RE = /^[A-Za-z0-9_\-$~!#%'@(){}^]{1,8}(\.[A-Za-z0-9_\-$~!#%'@(){}^]{1,3})?$/;
const SAFE_83_CHAR_RE = /^[A-Z0-9_\-$~!#%'@(){}^]$/;

function splitBaseExt(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? { base: name.slice(0, dot), ext: name.slice(dot + 1) } : { base: name, ext: '' };
}

/** 8.3形式で使える文字だけを残し、それ以外(2バイト文字含む)は'_'に置き換える(大文字化込み)。 */
function clean83Segment(s: string, maxLen: number): string {
  let out = '';
  for (const ch of s.toUpperCase()) {
    if (out.length >= maxLen) break;
    out += SAFE_83_CHAR_RE.test(ch) ? ch : '_';
  }
  return out;
}

/** Unicodeファイル名を8.3形式のDOSファイル名候補へ変換する(重複解消前)。 */
function sanitize83(name: string): string {
  const { base, ext } = splitBaseExt(name);
  const b = clean83Segment(base, 8) || 'FILE';
  const e = clean83Segment(ext, 3);
  return e ? `${b}.${e}` : b;
}

/** 提案名の重複を "~1" 等の連番で解消する(既存ファイル名/他の提案名とも突き合わせる)。 */
function dedupe83(names: string[], existingNames: string[]): string[] | null {
  const used = new Set(existingNames.map((n) => n.toUpperCase()));
  const result: string[] = [];
  for (const original of names) {
    const { base, ext } = splitBaseExt(original);
    let candidate = original;
    if (used.has(candidate.toUpperCase())) {
      for (let i = 1; i < 10000; i++) {
        const suffix = `~${i}`;
        const trimmedBase = `${base.slice(0, Math.max(1, 8 - suffix.length))}${suffix}`;
        candidate = ext ? `${trimmedBase}.${ext}` : trimmedBase;
        if (!used.has(candidate.toUpperCase())) break;
      }
    }
    const key = candidate.toUpperCase();
    if (used.has(key)) return null;
    used.add(key);
    result.push(candidate);
  }
  return result;
}

function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

function downloadBytes(name: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes.slice()], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * ファイルマネージャダイアログを構築し container へ追加する。
 * player.ts からはボタン1つ分の配線(open()呼び出しとapplyStrings()連携)だけ行えばよい。
 */
export function buildFileManagerDialog(container: HTMLElement, callbacks: FileManagerCallbacks): FileManagerDialog {
  const titleEl = el('h2', { class: 'fm-title', id: 'file-transfer-title' }, [t('fmDialogTitle')]);
  const noteEl = el('p', { class: 'fm-note' }, [t('fmDialogNote')]);

  // --- 左ペイン(ホスト) ---
  const hostTitle = el('h3', { class: 'fm-pane-title' }, [t('fmHostPaneTitle')]);
  const hostFileInput = el('input', { type: 'file', class: 'fm-file-input', multiple: 'true' });
  const hostSelectBtn = el('button', { type: 'button', class: 'fm-select-btn' }, [t('fmSelectFilesBtn')]);
  const hostDropHint = el('p', { class: 'fm-drop-hint' }, [t('fmDropHint')]);
  const hostList = el('div', { class: 'fm-staged-list' });
  const hostPane = el('div', { class: 'fm-pane fm-pane-host' }, [
    hostTitle,
    el('div', { class: 'fm-pane-actions' }, [hostSelectBtn, hostFileInput]),
    hostDropHint,
    hostList,
  ]);

  // --- 中央の転送ボタン ---
  const toDiskBtn = el('button', { type: 'button', class: 'fm-transfer-btn' }, [t('fmCopyToPc98')]);
  const toHostBtn = el('button', { type: 'button', class: 'fm-transfer-btn' }, [t('fmSaveToHost')]);
  const transferControls = el('div', { class: 'fm-transfer-controls' }, [toDiskBtn, toHostBtn]);

  // --- 右ペイン(ディスク) ---
  const diskTitle = el('h3', { class: 'fm-pane-title' }, [t('fmDiskPaneTitle')]);
  const targetSelect = el('select', { class: 'fm-target-select' }) as HTMLSelectElement;
  const createFdBtn = el('button', { type: 'button', class: 'fm-action-btn' }, [t('fmCreateTransferFdBtn')]);
  const targetRow = el('div', { class: 'fm-target-row' }, [targetSelect, createFdBtn]);
  const upBtn = el('button', { type: 'button', class: 'fm-action-btn' }, [t('fmUpDir')]);
  const breadcrumbs = el('nav', { class: 'fm-breadcrumbs', 'aria-label': t('fmPathLabel') });
  const pathRow = el('div', { class: 'fm-path-row' }, [upBtn, breadcrumbs]);
  const diskRows = el('tbody');
  const sortColumns = [
    { key: 'name', label: () => t('fmNameColumn') },
    { key: 'size', label: () => t('fmSizeColumn') },
    { key: 'mtime', label: () => t('fmModifiedColumn') },
  ] as const;
  const sortHeaders = sortColumns.map(({ key, label }) => {
    const button = el('button', { type: 'button', class: 'fm-sort-btn' }, [label()]);
    const cell = el('th', { scope: 'col', class: `fm-col-${key}` }, [button]);
    return { key, button, cell, label };
  });
  const selectionHeader = el('th', { scope: 'col', class: 'fm-col-select', 'aria-label': t('fmSelectFilesBtn') });
  const diskTable = el('table', { class: 'fm-disk-table', 'aria-label': t('fmDiskPaneTitle') }, [
    el('thead', {}, [el('tr', {}, [selectionHeader, ...sortHeaders.map(({ cell }) => cell)])]),
    diskRows,
  ]);
  const diskEmpty = el('div', { class: 'fm-list-empty' });
  const diskList = el('div', { class: 'fm-disk-list' }, [diskTable, diskEmpty]);
  const spaceFill = el('div', { class: 'fm-space-fill' });
  const spaceTrack = el('div', { class: 'fm-space-track' }, [spaceFill]);
  const spaceLabel = el('div', { class: 'fm-space-label' });
  const deleteBtn = el('button', { type: 'button', class: 'fm-action-btn danger' }, [t('fmDeleteSelectedBtn')]);
  const mkdirBtn = el('button', { type: 'button', class: 'fm-action-btn' }, [t('fmMakeDirBtn')]);
  const diskActions = el('div', { class: 'fm-disk-actions' }, [deleteBtn, mkdirBtn]);
  const diskPane = el('div', { class: 'fm-pane fm-pane-disk' }, [
    diskTitle,
    targetRow,
    pathRow,
    diskList,
    spaceTrack,
    spaceLabel,
    diskActions,
  ]);

  const body = el('div', { class: 'fm-body' }, [hostPane, transferControls, diskPane]);
  const statusLine = el('div', { class: 'fm-status', role: 'status' });
  const transferProgress = el('progress', { class: 'fm-transfer-progress', hidden: '', 'aria-label': t('fmProgressLabel') });
  const closeBtn = el('button', { type: 'button', class: 'rom-close-btn' }, [t('fmCloseBtn')]);
  const modal = el('div', {
    class: 'rom-modal fm-modal', role: 'dialog', 'aria-modal': 'true',
    'aria-labelledby': titleEl.id, tabindex: '-1',
  }, [
    titleEl,
    noteEl,
    body,
    transferProgress,
    statusLine,
    el('div', { class: 'rom-modal-footer' }, [closeBtn]),
  ]);
  const backdrop = el('div', { class: 'rom-modal-backdrop fm-modal-backdrop hidden' }, [modal]);
  container.append(backdrop);

  // --- 状態 ---
  let staged: StagedItem[] = [];
  let stagedErrors: StagedError[] = [];
  const selectedStaged = new Set<number>();
  let targets: FmTarget[] = [];
  let currentTarget: FmTarget | null = null;
  let currentPath = '';
  let currentEntries: FatEntry[] = [];
  const selectedDiskNames = new Set<string>();
  let freeBytes = 0;
  let totalBytes = 0;
  let busy = false;
  let listingReady = false;
  let sortKey: DiskSortKey = 'name';
  let sortAscending = true;
  let drag: TransferDrag | null = null;

  function setStatus(message: string, isError = false): void {
    statusLine.textContent = message;
    statusLine.classList.toggle('error', isError);
  }

  function updateControls(): void {
    const canUseDisk = !busy && listingReady;
    const canNavigate = !busy && currentTarget?.editable;
    toDiskBtn.disabled = !canUseDisk || selectedStaged.size === 0;
    toHostBtn.disabled = !canUseDisk || selectedDiskNames.size === 0;
    deleteBtn.disabled = toHostBtn.disabled;
    mkdirBtn.disabled = !canUseDisk;
    upBtn.disabled = !canNavigate || currentPath === '';
    for (const button of [hostSelectBtn, createFdBtn, targetSelect, closeBtn]) button.disabled = busy;
    for (const { button } of sortHeaders) button.disabled = !canUseDisk;
    for (const control of hostList.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')) {
      control.disabled = busy;
    }
    for (const control of diskRows.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')) {
      control.disabled = !canUseDisk;
    }
    for (const button of breadcrumbs.querySelectorAll('button')) button.disabled = !canNavigate;
  }

  async function perform(task: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    updateControls();
    setStatus('');
    try {
      await task();
    } catch (error) {
      setStatus(t('fmListLoadFailed', { message: describeError(error) }), true);
    } finally {
      transferProgress.hidden = true;
      busy = false;
      updateControls();
    }
  }

  // --- ホスト側(左ペイン) ---
  function renderStagedList(): void {
    hostList.textContent = '';
    if (staged.length === 0 && stagedErrors.length === 0) {
      hostList.append(el('div', { class: 'fm-list-empty' }, [t('fmStagedEmpty')]));
      return;
    }
    const groups = new Map<string | undefined, StagedItem[]>();
    for (const item of staged) {
      const list = groups.get(item.group) ?? [];
      list.push(item);
      groups.set(item.group, list);
    }
    for (const item of groups.get(undefined) ?? []) {
      hostList.append(renderStagedRow(item));
    }
    for (const [group, items] of groups) {
      if (group === undefined) continue;
      hostList.append(el('div', { class: 'fm-staged-group-title' }, [group]));
      for (const item of items) hostList.append(renderStagedRow(item));
    }
    for (const err of stagedErrors) {
      hostList.append(
        el('div', { class: 'fm-staged-error' }, [t('fmArchiveError', { name: err.group, message: err.message })]),
      );
    }
  }

  function renderStagedRow(item: StagedItem): HTMLElement {
    const checkbox = el('input', { type: 'checkbox', 'aria-label': t('fmSelectEntry', { name: item.name }) });
    checkbox.checked = selectedStaged.has(item.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedStaged.add(item.id);
      else selectedStaged.delete(item.id);
      updateControls();
    });
    const nameEl = el('span', { class: 'fm-item-name' }, [item.name]);
    const sizeEl = el('span', { class: 'fm-item-size' }, [formatSize(item.size)]);
    const removeBtn = el('button', { type: 'button', class: 'fm-remove-btn', title: t('fmRemoveBtn') }, ['×']);
    removeBtn.addEventListener('click', () => {
      staged = staged.filter((s) => s.id !== item.id);
      selectedStaged.delete(item.id);
      renderStagedList();
      updateControls();
    });
    const selection = el('label', { class: 'fm-entry-select' }, [checkbox]);
    const row = el('div', { class: 'fm-staged-item', draggable: 'true' }, [selection, nameEl, sizeEl, removeBtn]);
    row.addEventListener('dragstart', event => {
      const ids = selectedStaged.has(item.id) ? Array.from(selectedStaged) : [item.id];
      startDrag(event, { from: 'host', ids });
    });
    return row;
  }

  async function addHostFiles(files: File[]): Promise<void> {
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (isArchive(file.name)) {
        try {
          const entries = await extractArchive(file.name, bytes);
          for (const entry of entries) {
            staged.push({
              id: nextStagedId++,
              name: entry.name,
              size: entry.data.length,
              data: entry.data,
              group: file.name,
            });
          }
        } catch (err) {
          stagedErrors.push({
            id: nextStagedId++,
            group: file.name,
            message: describeError(err),
          });
        }
      } else {
        staged.push({ id: nextStagedId++, name: file.name, size: bytes.length, data: bytes });
      }
    }
    renderStagedList();
  }

  hostSelectBtn.addEventListener('click', () => hostFileInput.click());
  hostFileInput.addEventListener('change', () => {
    const files = Array.from(hostFileInput.files ?? []);
    hostFileInput.value = '';
    if (files.length > 0) void perform(() => addHostFiles(files));
  });

  // --- ディスク側(右ペイン) ---
  function targetLabel(target: FmTarget): string {
    if (target.kind === 'slot') {
      const slotName = t('fdSlotLabel', { drive: target.drive ?? 1 });
      if (!target.name) return `${slotName} (${t('fmUnmountedLabel')})`;
      return target.editable ? `${slotName}: ${target.name}` : `${slotName}: ${target.name} (${t('fmNotEditableNote')})`;
    }
    const mountedSuffix = target.mounted ? ` [${t('fmMountedBadge')}]` : '';
    return `${target.name ?? target.ref}${mountedSuffix}`;
  }

  function renderTargetOptions(): void {
    const prevIndex = targetSelect.selectedIndex;
    targetSelect.textContent = '';
    targets.forEach((target, index) => {
      const opt = el('option', { value: String(index) }, [targetLabel(target)]);
      if (!target.editable) opt.disabled = true;
      targetSelect.append(opt);
    });
    if (prevIndex >= 0 && prevIndex < targets.length) targetSelect.selectedIndex = prevIndex;
  }

  async function refreshTargets(preferRef?: string): Promise<void> {
    targets = await callbacks.listTargets();
    renderTargetOptions();
    let index = preferRef ? targets.findIndex((tg) => tg.ref === preferRef && tg.editable) : -1;
    if (index < 0) index = targets.findIndex((tg) => tg.editable);
    if (index < 0) index = 0;
    targetSelect.selectedIndex = targets.length > 0 ? index : -1;
    currentTarget = targets[index] ?? null;
    currentPath = '';
    await refreshDiskList();
  }

  targetSelect.addEventListener('change', () => {
    void perform(async () => {
      currentTarget = targets[targetSelect.selectedIndex] ?? null;
      currentPath = '';
      await refreshDiskList();
    });
  });

  function navigate(path: string): void {
    if (!currentTarget?.editable || path === currentPath) return;
    void perform(async () => {
      currentPath = path;
      try {
        await refreshDiskList();
      } finally {
        breadcrumbs.querySelector<HTMLElement>('[aria-current="page"]')?.focus();
      }
    });
  }

  function renderPath(): void {
    breadcrumbs.replaceChildren();
    const segments = currentPath ? currentPath.split('/') : [];
    const labels = [t('fmPathRoot'), ...segments];
    for (const [index, label] of labels.entries()) {
      if (index > 0) breadcrumbs.append(el('span', { 'aria-hidden': 'true' }, ['›']));
      if (index === labels.length - 1) {
        breadcrumbs.append(el('span', { 'aria-current': 'page', tabindex: '-1' }, [label]));
        continue;
      }
      const path = segments.slice(0, index).join('/');
      const button = el('button', { type: 'button', class: 'fm-crumb' }, [label]);
      button.addEventListener('click', () => navigate(path));
      breadcrumbs.append(button);
    }
  }

  function renderSpace(): void {
    const used = totalBytes > 0 ? Math.min(1, Math.max(0, (totalBytes - freeBytes) / totalBytes)) : 0;
    spaceFill.style.width = `${Math.round(used * 100)}%`;
    spaceLabel.textContent = t('fmFreeSpaceLabel', { free: formatSize(freeBytes), total: formatSize(totalBytes) });
  }

  function renderDiskList(): void {
    diskRows.replaceChildren();
    diskTable.hidden = !listingReady;
    if (!currentTarget || !currentTarget.editable) {
      diskEmpty.textContent = t('fmSelectEditableTarget');
    } else {
      diskEmpty.textContent = listingReady && currentEntries.length === 0 ? t('fmEmptyDir') : '';
    }
    diskEmpty.hidden = diskEmpty.textContent === '';
    for (const { key, cell, button, label } of sortHeaders) {
      button.textContent = label();
      if (key === sortKey) cell.setAttribute('aria-sort', sortAscending ? 'ascending' : 'descending');
      else cell.removeAttribute('aria-sort');
    }
    const sorted = [...currentEntries].sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      const byName = a.name.localeCompare(b.name);
      const order = sortKey === 'name' ? byName : a[sortKey] - b[sortKey];
      return order ? order * (sortAscending ? 1 : -1) : byName;
    });
    for (const entry of sorted) diskRows.append(renderDiskRow(entry));
    updateControls();
  }

  function renderDiskRow(entry: FatEntry): HTMLElement {
    const selection = el('td', { class: 'fm-col-select' });
    const name = el('td', { class: 'fm-col-name' });
    const row = el('tr', { class: entry.isDir ? 'fm-disk-item dir' : 'fm-disk-item' }, [
      selection,
      name,
      el('td', { class: 'fm-col-size fm-item-size' }, [entry.isDir ? '' : formatSize(entry.size)]),
      el('td', { class: 'fm-col-mtime fm-item-mtime' }, [entry.mtime ? new Date(entry.mtime).toLocaleString() : '']),
    ]);
    if (entry.isDir) {
      const folder = el('button', { type: 'button', class: 'fm-folder-btn', title: entry.name }, [
        el('span', { class: 'fm-folder-icon', 'aria-hidden': 'true' }),
        el('span', { class: 'fm-item-name' }, [entry.name]),
      ]);
      folder.addEventListener('click', () => navigate(joinPath(currentPath, entry.name)));
      name.append(folder);
    } else {
      const checkbox = el('input', { type: 'checkbox', 'aria-label': t('fmSelectEntry', { name: entry.name }) });
      checkbox.checked = selectedDiskNames.has(entry.name);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedDiskNames.add(entry.name);
        else selectedDiskNames.delete(entry.name);
        updateControls();
      });
      selection.append(el('label', { class: 'fm-entry-select' }, [checkbox]));
      name.append(el('span', { class: 'fm-item-name', title: entry.name }, [entry.name]));
      row.draggable = true;
      row.addEventListener('dragstart', event => {
        if (!currentTarget || !listingReady) return event.preventDefault();
        const names = selectedDiskNames.has(entry.name) ? Array.from(selectedDiskNames) : [entry.name];
        startDrag(event, { from: 'disk', names, target: currentTarget, path: currentPath });
      });
    }
    return row;
  }

  upBtn.addEventListener('click', () => navigate(currentPath.split('/').slice(0, -1).join('/')));

  for (const { key, button } of sortHeaders) {
    button.addEventListener('click', () => {
      sortAscending = sortKey === key ? !sortAscending : true;
      sortKey = key;
      renderDiskList();
    });
  }

  async function refreshDiskList(): Promise<void> {
    listingReady = false;
    currentEntries = [];
    selectedDiskNames.clear();
    freeBytes = totalBytes = 0;
    renderPath();
    renderDiskList();
    renderSpace();
    if (currentTarget?.editable) {
      const { entries, free, total } = await callbacks.listDir(currentTarget, currentPath);
      currentEntries = entries;
      freeBytes = free;
      totalBytes = total;
      listingReady = true;
      renderDiskList();
      renderSpace();
    }
  }

  mkdirBtn.addEventListener('click', () => {
    if (busy || !currentTarget || !listingReady) return;
    const name = prompt(t('fmMakeDirPrompt'), '');
    if (!name) return;
    if (!VALID_83_RE.test(name)) {
      alert(t('fmMakeDirInvalidName', { name }));
      return;
    }
    const target = currentTarget;
    const path = joinPath(currentPath, name);
    void perform(async () => {
      await callbacks.makeDir(target, path);
      await refreshDiskList();
    });
  });

  deleteBtn.addEventListener('click', () => {
    if (busy || !currentTarget || !listingReady) return;
    const names = Array.from(selectedDiskNames);
    if (names.length === 0) return;
    if (!confirm(t('fmDeleteConfirm', { names: names.join(', ') }))) return;
    const target = currentTarget;
    const path = currentPath;
    void perform(async () => {
      for (const name of names) {
        try {
          await callbacks.deleteFile(target, joinPath(path, name));
        } catch (err) {
          setStatus(t('fmListLoadFailed', { message: describeError(err) }), true);
        }
      }
      await refreshDiskList();
    });
  });

  createFdBtn.addEventListener('click', () => {
    void perform(async () => {
      const { sourceKey, name } = await callbacks.createTransferFd('transfer.xdf');
      await refreshTargets(sourceKey);
      setStatus(t('fmTransferFdCreated', { name }));
    });
  });

  // --- 転送 ---
  toDiskBtn.addEventListener('click', () => copyToDisk(selectedStaged));
  toHostBtn.addEventListener('click', () => saveToHost(selectedDiskNames));

  function copyToDisk(ids: ReadonlySet<number>): void {
    if (busy || !currentTarget || !listingReady) return;
    const target = currentTarget;
    const path = currentPath;
    const items = staged.filter((s) => ids.has(s.id));
    if (items.length === 0) return;
    void perform(async () => {
      // Read the destination again before proposing names. Reopening the same
      // directory may reveal files written by the guest after our last listing.
      const { entries, free } = await callbacks.listDir(target, path);
      const proposed = dedupe83(items.map((it) => sanitize83(it.name)), entries.map((entry) => entry.name));
      if (!proposed) {
        setStatus(t('fmNoAvailableName'), true);
        return;
      }

      const renameList = items.map((it, i) => `${it.name} → ${proposed[i]}`).join('\n');
      if (!confirm(t('fmRenameConfirm', { list: renameList }))) return;

      const totalSize = items.reduce((sum, it) => sum + it.data.length, 0);
      if (totalSize > free) {
        setStatus(t('fmInsufficientSpace', { needed: formatSize(totalSize), free: formatSize(free) }), true);
        return;
      }

      const result = await transferBatch(proposed, async (name, index) => {
        await callbacks.writeFile(target, joinPath(path, name), items[index].data);
        selectedStaged.delete(items[index].id);
      });
      renderStagedList();
      await refreshDiskList();
      reportTransfer(result);
    });
  }

  function saveToHost(names: ReadonlySet<string>): void {
    if (busy || !currentTarget || !listingReady) return;
    const target = currentTarget;
    const path = currentPath;
    const files = currentEntries.filter((entry) => !entry.isDir && names.has(entry.name)).map(({ name }) => name);
    if (files.length === 0) return;
    void perform(async () => {
      const result = await transferBatch(files, async (name, index) => {
        const bytes = await callbacks.readFile(target, joinPath(path, name));
        downloadBytes(name, bytes);
        // Keep the browser's existing spacing between consecutive downloads.
        if (index + 1 < files.length) await new Promise<void>((resolve) => setTimeout(resolve, 150));
      });
      reportTransfer(result);
    });
  }

  async function transferBatch(names: string[], transfer: (name: string, index: number) => Promise<void>) {
    transferProgress.max = names.length;
    transferProgress.value = 0;
    transferProgress.hidden = false;
    let succeeded = 0;
    const failed: string[] = [];
    for (const [index, name] of names.entries()) {
      setStatus(t('fmTransferring', { current: index + 1, total: names.length }));
      try {
        await transfer(name, index);
        succeeded++;
      } catch (err) {
        failed.push(`${name} (${describeError(err)})`);
      }
      transferProgress.value = index + 1;
    }
    return { succeeded, failed };
  }

  function reportTransfer({ succeeded, failed }: { succeeded: number; failed: string[] }): void {
    setStatus(
      failed.length === 0
        ? t('fmTransferDone', { succeeded, failed: 0 })
        : t('fmTransferFailedDetail', { names: failed.join(', ') }),
      failed.length > 0,
    );
  }

  function startDrag(event: DragEvent, transfer: TransferDrag): void {
    if (busy || !event.dataTransfer) {
      event.preventDefault();
      return;
    }
    drag = transfer;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(TRANSFER_DRAG_TYPE, transfer.from);
  }

  function clearDrag(): void {
    drag = null;
    hostPane.classList.remove('dropzone-active');
    diskPane.classList.remove('dropzone-active');
  }

  modal.addEventListener('dragend', clearDrag);

  function canDrop(transfer: DataTransfer, destination: 'host' | 'disk'): boolean {
    if (busy) return false;
    if (!transfer.types.includes(TRANSFER_DRAG_TYPE)) {
      return destination === 'host' && transfer.types.includes('Files');
    }
    if (!drag || drag.from === destination || !listingReady || !currentTarget) return false;
    return drag.from === 'host' || (drag.target === currentTarget && drag.path === currentPath);
  }

  for (const [destination, pane] of [['host', hostPane], ['disk', diskPane]] as const) {
    pane.addEventListener('dragover', event => {
      if (!event.dataTransfer || !canDrop(event.dataTransfer, destination)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      pane.classList.add('dropzone-active');
    });
    pane.addEventListener('dragleave', event => {
      if (!(event.relatedTarget instanceof Node) || !pane.contains(event.relatedTarget)) {
        pane.classList.remove('dropzone-active');
      }
    });
    pane.addEventListener('drop', event => {
      event.preventDefault();
      event.stopPropagation();
      const transfer = event.dataTransfer;
      const internal = drag;
      const accepted = transfer && canDrop(transfer, destination);
      clearDrag();
      if (!accepted) return;
      if (transfer.types.includes(TRANSFER_DRAG_TYPE)) {
        if (internal?.from === 'host') copyToDisk(new Set(internal.ids));
        if (internal?.from === 'disk') saveToHost(new Set(internal.names));
      } else {
        const files = Array.from(transfer.files);
        if (files.length > 0) void perform(() => addHostFiles(files));
      }
    });
  }

  function close(): void {
    if (busy) return;
    clearDrag();
    backdrop.classList.add('hidden');
  }

  closeBtn.addEventListener('click', () => close());
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  for (const eventName of ['keydown', 'keyup', 'keypress'] as const) {
    modal.addEventListener(eventName, event => event.stopPropagation());
  }
  modal.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.isComposing) return;
    event.preventDefault();
    close();
  });

  function open(): void {
    if (busy) return;
    backdrop.classList.remove('hidden');
    modal.focus();
    void perform(refreshTargets);
  }

  return {
    open,
    applyStrings(): void {
      titleEl.textContent = t('fmDialogTitle');
      noteEl.textContent = t('fmDialogNote');
      toDiskBtn.textContent = t('fmCopyToPc98');
      toHostBtn.textContent = t('fmSaveToHost');
      hostTitle.textContent = t('fmHostPaneTitle');
      hostSelectBtn.textContent = t('fmSelectFilesBtn');
      hostDropHint.textContent = t('fmDropHint');
      diskTitle.textContent = t('fmDiskPaneTitle');
      diskTable.setAttribute('aria-label', t('fmDiskPaneTitle'));
      selectionHeader.setAttribute('aria-label', t('fmSelectFilesBtn'));
      breadcrumbs.setAttribute('aria-label', t('fmPathLabel'));
      transferProgress.setAttribute('aria-label', t('fmProgressLabel'));
      createFdBtn.textContent = t('fmCreateTransferFdBtn');
      upBtn.textContent = t('fmUpDir');
      deleteBtn.textContent = t('fmDeleteSelectedBtn');
      mkdirBtn.textContent = t('fmMakeDirBtn');
      closeBtn.textContent = t('fmCloseBtn');
      renderTargetOptions();
      renderStagedList();
      renderPath();
      renderDiskList();
      renderSpace();
    },
  };
}
