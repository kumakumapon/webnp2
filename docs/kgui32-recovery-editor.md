# Work復旧とEditorの追加操作

EditorのToolsからFind、Replace、Recovery、Use LF、Use CRLFを選びます。
Ctrl+Fは検索、Ctrl+Hは置換、F3は次の一致、Ctrl+Tは復旧を開きます。
検索は大文字小文字を区別する文字列一致で、末尾から先頭へ戻ります。
取消や不一致では本文・選択を保持します。Allによる全置換は一回のUndoで戻せます。
Shiftを押しながら矢印、Home/End、Page Up/Downで範囲選択できます。

LF/CRLFは下部へ表示します。読み込んだCRLFは内部でLFに正規化し、均一なCRLF文書は
保存形式もCRLFにします。混在文書はLFを初期値にします。形式変更もdirtyとUndo/Redoに
反映します。保存時の改行変換後に64 KiBを超える場合は保存せず本文と原本を保持します。
ASCII・半角カナ・JIS X 0208のShift-JIS、Tab・改行が対象です。単独CRや不正な文字列は
読み込めません。[日本語表示・Shift-JIS読書](kgui32-japanese.md)も参照してください。

右下のサイズ変更で編集領域が広がります。640×400/800×600に応じて列・行数を増やし、
長い行は複数の描画命令へ分割します。最大40命令に収めるため、密な長文では表示行数を
調整します。選択表示も同じ上限内に収めます。

## 残存TMP/BAKの明示的な復旧

保存で残存TMP/BAKが見つかった場合はRecoveryを開きます。既存の未保存文書を保持した
まま、現在のWorkだけを調べます。検証済みHDDがなければ明示的なFD起動のA:\WORKです。

1. TMP/BAKが残るベース名を選び、InspectでTXT・TMP・BAKの状態と内容を確認します。
2. TMPまたはBAKを選び、使われていない8.3形式のTXT名を入力します。
   TXTが存在する場合の初期値はRESCUED.TXTです。元TXTがない場合は元の名前も選べます。
3. Restoreで確認画面を開き、Moveで候補をTXTへ移します。Cancelでは変更しません。
4. 他の候補も必要なら別名へ復旧します。Editorへ戻って通常の保存を再試行できます。

既存TXTへの上書きや他の候補の削除は行いません。復旧直前にTXT/TMP/BAKすべての
revisionを再確認します。別Editorなどによる状態変更ではBack→Refresh→Inspectから
確認し直します。保護属性、無効名、64 KiB超、読み取り失敗では復旧を拒否します。
デバイス障害時は未保存文書と候補のデータを保持します。DOS renameの途中で媒体が部分的に
書き込まれた場合は候補名または復旧先名を確認してください。電源断に対するFATの原子性を
保証するものではありません。任意パス・ドライブ、汎用renameや削除は提供しません。

## 配布と検証

既定は[HDD単独起動](hdd-boot.md)で、保存先はA:\WORKです。
compact FD＋APPS HDDと、全GUIアプリを収録したFD単独起動も維持します。
GUI用FDではK386専用の70 KiBバイナリ試験データDATA32.BINだけを省き、復旧用プログラムと
FD Workの空きを確保します。独立したK386配布ディスクの収録物は変更しません。

GitHub ActionsのKGUI32 recovery and Editor toolsがPEGC/Cirrusそれぞれで復旧と
Editor操作を検査します。取消・競合・保護・実際のINT1Bh書き込み障害、実CPL3の不正要求、
保存/export/コールドブート、二つの独立アプリ、媒体保護と終了時の資源回収を確認します。
スクリーンショット、verification.json、復旧媒体をartifactへ保存します。
このチャットではpreviewサーバーを起動せず、E2EはGitHub Actionsで実行します。

限定APIの契約はMS-DOSの[RECOVERY-SDK.md](https://github.com/kumakumapon/MS-DOS/blob/main/tools/kgui32/RECOVERY-SDK.md)を参照してください。
