# KGUI32 SDK4: 保存できるエディタ

Welcome → Editor (`KGEDIT.EXE`) を開きます。別の32ビットGUIイメージを使い、
メモリは16 MiBに設定します。従来KDESKの起動方法は変わりません。

- **Save / Ctrl+S**: 現在のWork内のファイルを保存。未命名ならSave Asを開きます。
- **Save As / Ctrl+W**: 共通ダイアログの名前欄へ `NOTE.TXT` などを入力してEnter。
  Tabでフィルタ・一覧・名前・Save・Cancelを移動します。上書きはReplace/Rで確認し、
  Escで取り消せます。名前の大文字小文字は区別しません。
- **Open / Ctrl+O**: 対応HDDがあればWork、なければA:ルートから開きます。Workで
  保存したファイルを選択します。Rootで従来の
  読み取り専用ルートへ戻れます。Open内ではCtrl+WでもRoot/Workを切り替えられます。ルートから開いた文書の保存先もWorkです。
- 終了・新規作成・読込時に変更があれば **Save/S・Discard/D・Cancel/Esc**。
  保存ダイアログで取り消した場合も、文書とウィンドウを保持します。
- Undo/Redoは保存しても保持します。保存時の内容へ戻るとModifiedが消えます。
- 別エディタが同じファイルを更新した場合、古い内容からのSaveは拒否します。
  再読込するか、明示的にSave Asで別名保存／上書きを選択します。

保存は **認識済みHDDのWORK（通常B:\WORK）、HDDなしではA:\WORK内の
通常の8.3形式TXT、最大64 KiB、ASCII** に限定します。
ダイアログには実際の保存先・HDD/FD・DOSの空き容量・一時保存に必要な容量を表示します。
認識済みHDDのWORKが使えない場合は、そのHDDのエラーを返します。
CRLFは読込時にLFへ正規化し、均一なCRLF文書は保存形式を保持します。
ToolsでLF/CRLFを選択できます（変換後も最大64 KiB）。起動ファイルやルート、EXE、アプリが指定するドライブ、
日本語、任意のサブディレクトリ、汎用の削除・名前変更は公開APIの対象外です。
2アプリ枠・各4 MiB、GUI専用4 MiBの構成を維持します。保存可能容量は選択先の空き容量に依存し、
上書きでは新しい文書を一時保存する追加の空き領域が必要です。

WebNP2の既存の保存／ディスク書き出し機能で、変更を含むイメージを保管できます。
同梱オリジナルへ戻す前に書き出してください。新しい同梱イメージは別のハッシュ名を
持ち、以前保存したユーザーディスクを自動的に置き換えません。

容量不足やI/O失敗では、文書・履歴・Modifiedを保持します。書き込みは一時ファイルへ
行い、元のファイルはバックアップ名で保護してから置き換えます。処理は実モードの
DOS仲介層で直列化され、割り込みや描画コールバックからDOSを呼びません。
転送中は他タスクが一時的に待ち、転送終了後に実行を再開します。

**FAT12/FAT16のDOS名前変更は、電源断に対して原子的ではありません。** 保存途中のリセットで
`NAME.TMP` / `NAME.BAK` が残る場合、まずディスクを書き出して保全してください。
EditorのTools → RecoveryからTXT/TMP/BAKを確認し、候補を未使用TXT名へ明示的に復旧できます。
詳しい操作は[復旧とEditor追加操作](kgui32-recovery-editor.md)を参照してください。TMP/BAKを自動上書き・削除しません。
新しいTXTの保存後に古いBAKの削除だけが失敗した場合は、保存済みとして通知します。
EndとCtrl+Gは非常停止で、未保存の文書を破棄します。

API・失敗時の契約は [native SAVE-SDK.md](https://github.com/kumakumapon/MS-DOS/blob/main/tools/kgui32/SAVE-SDK.md)。
`verify-kgui32-save.mjs` はPEGC/Cirrusで実CPU/独立RAM、Save/Save As/競合/取消、
保存FDのコールドブート、満杯のFAT12、ハンドル・メモリ回収と保護ファイル不変性を検証します。
HDD構成・起動・追加E2Eは [kgui32-hdd-workspace.md](kgui32-hdd-workspace.md) を参照してください。
