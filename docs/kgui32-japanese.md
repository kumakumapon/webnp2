# 独立GUIの日本語表示・Shift-JIS読書

Editor、FilesのTXTプレビュー、復旧のTXT/TMP/BAKプレビューは、ASCII、半角カナ、
JIS X 0208のShift-JIS文書を表示できます。通常のHDD単独起動ではA:ルートの
`JPDEMO.TXT`をFilesから開くと、日本語・半角カナの例を確認できます。

Editorでは、既存の日本語文書を開き、ASCIIの追記、日本語の選択・コピー・貼付・削除、
Undo/Redo、検索・置換、保存ができます。検索語や置換文字列に日本語を使う場合は、
文書内で選択してCtrl+C、Find/Replaceの入力欄でCtrl+Vを使います。入力欄は単一行・
63バイトまで、ゲスト内クリップボードは1,024バイトまでです。
ホストのクリップボードは使いません。

## 文字・保存の扱い

- 半角は8×16、全角は16×16で、PC-98のCG-ROMから取得した文字をGUI内へ描画します。
- 左右移動、Shift選択、クリック、削除、折返し、描画命令の分割は2バイト文字を分断しません。
- 検索・置換は文字の先頭だけを候補にします。漢字の2バイト目がASCIIの記号と同じ値でも、
  その記号として検索・置換しません。
- Openは全文を検査してから取り込みます。不正なShift-JISやバイナリ、単独CR、読込失敗では
  現在の文書・履歴を保持します。
- 文書は内部LF、保存は選択したLF/CRLFです。日本語のバイト列を変換しません。
  読込と保存後のサイズはそれぞれ最大64 KiBで、文字数の上限ではありません。
- Work保存先は通常HDDのA:\WORKです。FD互換起動はFDのA:\WORK、従来FD＋HDD構成は
  HDDのB:\WORKです。名前は引き続きASCIIの8.3 TXTで、競合・保護・満杯・復旧の条件を維持します。

この段階ではIME、Unicode/UTF-8変換、CP932の拡張領域、日本語ファイル名、DOS端末の
日本語・文字属性の完全な再現は追加していません。日本語の新規入力・変換は次の開発段階です。
既存の2実行枠、各4 MiB＋GUI専用4 MiB、拡張メモリ16 MiB、公開ABIも維持します。

## 配布・受入検証

manifestはnativeの固定コミットと、`text_encoding: shift-jis`、
`japanese_glyphs: pc98-cg-rom`、`japanese_ime: false`を記録します。
HDD単独起動、従来FD＋APPS HDD、明示的FD互換起動を同じソースから生成します。
既存の利用者媒体を変換・更新する処理はありません。

GitHub Actionsの **KGUI32 Japanese text** がPEGC/Cirrus × text/saveの4構成を検証します。
実CPL3でのFiles→Editor、CG-ROM漢字・半角カナの全画素、独立Editor間のコピー、
文字境界の移動・削除・検索・履歴、不正Openでの未保存文書保持を確認します。
実際の保存APIに不正な文字列を渡す診断も行い、媒体全体が不変であることを調べます。
HDD/FDの保存・export・cold boot、4 KiBをまたぐ文字と64 KiB末尾の文字、明示的な
日本語TMP復旧、独立時計の進行、正常終了時の資源回収も確認します。
スクリーンショット・verification.json・保存媒体をartifactへ記録します。

このチャットではpreviewを起動せず、ブラウザE2EはGitHub Actionsで実行します。
ネイティブ契約は[MS-DOS JAPANESE.md](https://github.com/kumakumapon/MS-DOS/blob/main/tools/kgui32/JAPANESE.md)。
