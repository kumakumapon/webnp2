# Files／Editor連携

FilesのWork閲覧と、選択したTXTをEditorで開く機能を一組にしています。
配布用FD＋HDD構成と、従来の単独FD構成の両方に対応します。

## 操作

1. Welcomeから **Files** を開きます。最初は読み取り専用のA:ルートです。
2. **Work** ボタン、または **Ctrl+W** で保存先のWorkへ切り替えます。
   検証済みHDDがあればそのWork、単独FDではA:\\WORKです。WorkはTXTのみ表示します。
3. フィルターで絞り込み、一覧を選択します。**Open** はプレビュー、
   **Editor** ボタン／**Ctrl+O** は選択した文書の編集です。
4. Editorへフォーカスを移し、編集して **Ctrl+S** で保存します。
   A:ルートから開いた文書ではWorkへのSave Asになります。
5. Editorを保存して終了し、Filesへ戻って **Refresh** を押します。
   保存後のサイズと内容をプレビューでき、Editorで再度開けます。

Tabはフィルター、一覧、下部4ボタン、Work/Root、Editorの順に移動します。
Work/Root切り替えはフィルターを維持します。戻した一覧の内容がない場合は
フィルターを消してください。プレビューは最大128 KiB、EditorはASCIIの
TXTを最大64 KiB扱います。Workの既存API制限や保存時の競合検査も維持します。

実行スロットは2つです。Filesと既存のアプリで両方を使用している場合は
「Both slots in use: close a task」と表示します。既存Editorの未保存文書や
履歴を保持するため、保存してタスクを終了してから開き直してください。
停止中のタスクも使用中として扱います。バイナリ・欠落・読込不可の文書は
Editorにエラーを表示し、空の未変更文書のままにします。

## 実装と検証

ネイティブのINT 2Fサービスは、認証済み要求のnamespaceと8.3 TXT名だけを
受け付けます。固定のKGEDIT.EXE起動は割込み処理を抜けた後に実行し、
要求元の所有権・世代と空きスロットを再検査します。任意のパスや実行コマンドは
渡せません。閉じた／終了した世代の要求は無効になります。

`scripts/prepare-msdos4-cpanel-ci.sh` が対応するMS-DOSコミットを固定し、
配布FD／HDDへ新しいFilesとEditorを生成します。manifestの
`files_workspace_browser: 1` と `files_editor_launch: 1` が対応を示します。
ネイティブPRを先にマージし、そのコミットを参照するwebnp2 PRを続けます。

`KGUI32 Files Editor integration` CIはPEGC／Cirrusそれぞれで次を検証します。

- 実CPL3のFilesでHDD Workを列挙・プレビューし、選択文書を別のEditorへ渡す。
- 編集・保存・Filesの更新・再表示・再編集、保存HDDのコールドブート。
- 両スロット使用時に未保存Editorの世代・内容・履歴を維持する。
- 64 KiB超の選択、バイナリTXT、読み取り専用ルートとFD Workへの保存。
- 書き出したFAT12／FAT16の両FAT・割当・保護対象を独立検査し、終了後の
  DOS／XMS領域、ブリッジ、割込みベクタが全て元に戻ることを確認する。

実行例：`node scripts/verify-kgui32-files-editor.mjs BASE OUTPUT pegc`
（`cirrus`でも実行）。JSON、スクリーンショット、保存済みTHD／XDFをCIへ添付します。
復旧UI、任意のディレクトリやHDD形式、日本語編集、スロット追加は後続段階です。
