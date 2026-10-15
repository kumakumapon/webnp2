import { coreDiskAccess } from '../core/module.ts';
import type { WebNP2 } from '../api/webnp2.ts';
import { KdeskMediaLink, KDESK_PALETTE, imageToBmp } from '../api/kdesk-media.ts';
import { encodeSjisUnits } from '../api/sjis.ts';
import { getLang } from './strings.ts';

export function openKdeskMedia(np2: WebNP2): void {
  document.querySelector('.kdesk-media-backdrop')?.remove();
  const ja = getLang() === 'ja', link = new KdeskMediaLink();
  const tr = (a: string, b: string) => ja ? a : b;
  const backdrop = document.createElement('div'); backdrop.className = 'kdesk-media-backdrop';
  const panel = document.createElement('section'); panel.className = 'rom-modal kdesk-media';
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', tr('KDESK クリップボードと画像', 'KDESK Clipboard and Images'));
  const heading = document.createElement('h2'); heading.textContent = panel.getAttribute('aria-label'); panel.append(heading);
  const close = document.createElement('button'); close.className = 'kdesk-media-close'; close.textContent = tr('閉じる', 'Close');
  close.onclick = () => { backdrop.remove(); document.querySelector<HTMLCanvasElement>('#canvas')?.focus(); }; panel.append(close);
  const state = document.createElement('p'); state.className = 'kdesk-media-status'; state.setAttribute('role', 'status');
  const text = document.createElement('textarea'); text.className = 'kdesk-media-text'; text.rows = 5;
  text.setAttribute('aria-label', tr('クリップボードのテキスト', 'Clipboard text'));
  const textHeading = document.createElement('h3'); textHeading.textContent = tr('テキスト', 'Text'); panel.append(textHeading, text);
  const buttons = document.createElement('div'); buttons.className = 'kdesk-media-buttons'; panel.append(buttons);
  const action = (parent: HTMLElement, id: string, label: string, callback: () => Promise<void> | void) => {
    const button = document.createElement('button'); button.dataset.action = id; button.textContent = label;
    button.onclick = async () => {
      button.disabled = true; state.textContent = '';
      try { await callback(); } catch (error) { state.textContent = error instanceof Error ? error.message : String(error); }
      finally { button.disabled = false; }
    }; parent.append(button); return button;
  };
  action(buttons, 'get-text', tr('KDESKから取得', 'Get from KDESK'), () => { text.value = link.readText(); state.textContent = tr('DOSクリップボードを取得しました。', 'Retrieved the DOS clipboard.'); });
  action(buttons, 'copy-text', tr('ホストへコピー', 'Copy to host'), async () => {
    if (!navigator.clipboard?.writeText) throw new Error(tr('このブラウザではテキストを選択してコピーしてください。', 'Select and copy the text in this browser.'));
    await navigator.clipboard.writeText(text.value); state.textContent = tr('ホストへコピーしました。', 'Copied to host.');
  });
  action(buttons, 'read-text', tr('ホストから取得', 'Read from host'), async () => { text.value = await navigator.clipboard.readText(); state.textContent = tr('テキストを取得しました。', 'Retrieved text.'); });
  action(buttons, 'paste-text', tr('DOSへ貼り付け', 'Paste to DOS'), async () => {
    const box = link.find('text');
    if (box?.active === 1) {
      const address = link.requestTextPaste(text.value), start = Date.now();
      for (;;) {
        const result = link.pasteResult(address);
        if (!result.pending) { if (result.result) throw new Error(tr('貼り付けできません。メモの空き容量や確認画面を確認してください。', 'Cannot paste: check Memo capacity or close its confirmation dialog.')); break; }
        if (Date.now() - start > 5000) throw new Error(tr('KDESKの応答がありません。実行を再開してから確認してください。', 'KDESK did not respond. Resume the emulator and check again.'));
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    } else {
      if (link.find('image')) throw new Error(tr('画像アプリでは画像の取り込みを使用してください。', 'Use image import while an image application is active.'));
      if (encodeSjisUnits(text.value).skipped.length) throw new Error(tr('Shift_JISに変換できない文字があります。', 'Some characters cannot be represented in Shift_JIS.'));
      const result = await np2.pasteText(text.value);
      if (result.skipped.length) throw new Error(tr('Shift_JISに変換できない文字があります。', 'Some characters cannot be represented in Shift_JIS.'));
    }
    state.textContent = tr('DOSへ貼り付けました。', 'Pasted to DOS.');
  });
  const hint = document.createElement('p'); hint.textContent = tr('KDESKメモはASCII・最大1023文字。日本語はテキストエディタで扱えます。コピーや読み取りはボタンを押したときだけ行います。', 'KDESK Memo accepts up to 1023 ASCII characters. Use the text editor for Japanese. Host clipboard access occurs only when requested.'); panel.append(hint);
  const imageHeading = document.createElement('h3'); imageHeading.textContent = tr('画像', 'Images'); panel.append(imageHeading);
  const preview = document.createElement('canvas'); preview.className = 'kdesk-media-preview'; preview.hidden = true; panel.append(preview);
  const imageButtons = document.createElement('div'); imageButtons.className = 'kdesk-media-buttons'; panel.append(imageButtons);
  action(imageButtons, 'get-image', tr('DOS画像を取得', 'Get DOS image'), () => {
    const image = link.readImage(); preview.width = image.width; preview.height = image.height; preview.hidden = false;
    const ctx = preview.getContext('2d')!, pixels = ctx.createImageData(image.width, image.height);
    image.pixels.forEach((index, i) => { pixels.data.set([...KDESK_PALETTE[index],255], i * 4); }); ctx.putImageData(pixels, 0, 0);
    state.textContent = tr('画像を取得しました。', 'Retrieved image.');
  });
  action(imageButtons, 'copy-image', tr('画像をホストへコピー', 'Copy image to host'), async () => {
    if (preview.hidden) throw new Error(tr('先にDOS画像を取得してください。', 'Get a DOS image first.'));
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error(tr('画像コピーに未対応です。PNG保存を使用してください。', 'Image clipboard is unavailable. Use Save PNG.'));
    const blob = new Promise<Blob>((resolve, reject) => preview.toBlob(b => b ? resolve(b) : reject(new Error('PNG conversion failed')), 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); state.textContent = tr('画像をコピーしました。', 'Copied image.');
  });
  action(imageButtons, 'save-image', tr('PNG保存', 'Save PNG'), () => {
    if (preview.hidden) throw new Error(tr('先にDOS画像を取得してください。', 'Get a DOS image first.'));
    const a = document.createElement('a'); a.href = preview.toDataURL('image/png'); a.download = 'kdesk-image.png'; a.click();
  });
  const importLabel = document.createElement('label'); importLabel.textContent = tr('画像をBMPとして取り込む（最大320×200）', 'Import an image as BMP (up to 320×200)');
  const file = document.createElement('input'); file.type = 'file'; file.accept = 'image/*'; file.className = 'kdesk-media-file'; importLabel.append(file); panel.append(importLabel);
  const filenameLabel = document.createElement('label'); filenameLabel.textContent = tr('DOSファイル名', 'DOS filename');
  const filename = document.createElement('input'); filename.value = 'IMPORT.BMP'; filename.className = 'kdesk-media-filename'; filenameLabel.append(filename); panel.append(filenameLabel);
  const importImage = async (selected: Blob) => {
    const name = filename.value.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{1,8}\.BMP$/.test(name)) throw new Error(tr('英数字8文字以内の名前と.BMPを指定してください。', 'Use an 8-character DOS name followed by .BMP.'));
    const bitmap = await createImageBitmap(selected);
    try {
      const ratio = Math.min(1, 320 / bitmap.width, 200 / bitmap.height);
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.floor(bitmap.width * ratio)); canvas.height = Math.max(1, Math.floor(bitmap.height * ratio));
      const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const data = imageToBmp(canvas.width, canvas.height, ctx.getImageData(0, 0, canvas.width, canvas.height).data);
      const listing = await np2.diskListFiles('fd1');
      if (listing.entries.some(e => e.name.toUpperCase() === name) && !window.confirm(tr(`${name} を置き換えますか？`, `Replace ${name}?`))) return;
      // The dialog intercepts guest keys; finish any already-started disk I/O
      // before applying a host-side FAT update.
      const deadline = Date.now() + 10000;
      let previous = coreDiskAccess()?.fdd[0], quietSince = Date.now();
      while (Date.now() - quietSince < 500) {
        await new Promise(resolve => setTimeout(resolve, 50));
        const current = coreDiskAccess()?.fdd[0];
        if (current !== previous) { previous = current; quietSince = Date.now(); }
        if (Date.now() > deadline) throw new Error(tr('ディスクが使用中です。処理終了後に取り込んでください。', 'The disk is busy. Import again after the operation finishes.'));
      }
      await np2.diskWriteFile('fd1', name, data);
      state.textContent = tr(`${name} を取り込みました。KDESKのFilesまたはKVIEW/KPAINTのF2で開けます。`, `Imported ${name}. Open it from KDESK Files or with F2 in KVIEW/KPAINT.`);
    } finally { bitmap.close(); }
  };
  action(panel, 'import-image', tr('FDD1へ取り込む', 'Import to FDD1'), async () => {
    const selected = file.files?.[0];
    if (!selected) throw new Error(tr('画像ファイルを選択してください。', 'Choose an image file.'));
    await importImage(selected);
  });
  action(panel, 'import-host-image', tr('ホスト画像を取り込む', 'Import host image'), async () => {
    if (!navigator.clipboard?.read) throw new Error(tr('画像読み取りに未対応です。画像ファイルを選択してください。', 'Image clipboard reading is unavailable. Choose an image file.'));
    for (const item of await navigator.clipboard.read()) for (const type of item.types) {
      if (type.startsWith('image/')) { await importImage(await item.getType(type)); return; }
    }
    throw new Error(tr('クリップボードに画像がありません。', 'The clipboard contains no image.'));
  });
  panel.append(state); backdrop.append(panel); document.body.append(backdrop);
  for (const event of ['keydown','keyup','keypress']) panel.addEventListener(event, e => e.stopPropagation());
  panel.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.isComposing) close.click(); });
  text.focus();
}
