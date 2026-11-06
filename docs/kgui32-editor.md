# KGUI32 SDK3 / 一時テキストエディタ

KGUI32のWelcome > Editor、またはRunから `KGEDIT.EXE` で起動します。
最大64 KiBのASCII文書をメモリ内で編集します。ディスク保存はありません。
編集内容は終了・強制終了・再起動で失われます。

- Enter/Tab、カーソル、Backspace/Deleteで編集。Ctrl+Aで全選択。
- マウスドラッグ、またはCtrl+Bで選択開始後にカーソル移動して範囲選択。
- Ctrl+C/X/Vでゲスト内コピー・切り取り・貼付。上限1024バイト。
- Ctrl+Z/YでUndo/Redo。履歴は8状態、最大7回のUndo。
- New/Ctrl+N、Open/Ctrl+O。共通ファイル選択はA:ルートの8.3名、読み取り専用。
  フィルタ、Tab、一覧・スクロールバー、Open/Cancelを利用できます。
- 読み込みではCRLFをLFへ正規化。日本語・バイナリ・64 KiB超は拒否し、元の文書を保持。
- XとF10は変更の破棄を確認します。D/Discardで破棄、Esc/Cancelで取り消し。
  他のアプリが既に終了を受け入れている場合、そのアプリは再起動しません。
- EditorではCtrl+L/P/R/Eを編集側へ転送。管理はRun/Stop/Resume/End/Againボタン。
  Endは確認なしの強制終了。F2/Ctrl+KでWelcomeへ戻れます。

GUI専用4 MiB、2つの混在枠・各4 MiB、16 MiB設定を維持します。
エディタ2本でクリップボードを共有できます。ホストのクリップボードは操作しません。
画面内は最大47桁・14行です。一般の日本語入力、ディスク保存、枠の増加は後続です。

SDKのAPI・所有権・通常終了と非常停止の契約は
[EDITOR-SDK.md](https://github.com/kumakumapon/MS-DOS/blob/codex/kgui32-sdk3-editor/tools/kgui32/EDITOR-SDK.md)。
Playwrightの `scripts/verify-kgui32-editor.mjs` はPEGC/Cirrusで実CPU/RAM、
複数行・選択・Undo/Redo・別プロセス貼付・キー転送・終了取消・実ファイル内容と
全FAT不変性を検査します。実施結果は開発PRへ記録します。
