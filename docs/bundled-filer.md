# 同梱 DOS 4.0 起動FDのファイラー

既存の「MS-DOS 4.0 + RetroBasic で起動」から起動し、`A>` で `FD98` を実行します。
PC-98用の二画面ファイラーを同じFDに同梱しています。F1でヘルプ、F10でDOSに戻ります。

| キー | 操作 |
| --- | --- |
| ↑↓ / J・K、PgUp・PgDn、Home | 選択、ページ移動 |
| Tab / ←→、Enter、Backspace | 左右切替、ディレクトリへ移動、親へ移動 |
| F2、F3、F4 | 名前変更、ASCIIファイル閲覧、再読み込み |
| F5、F6 | コピー、移動（保存先は反対側パネル） |
| F7、F8 | ディレクトリ作成、削除（Yで確認） |
| F9 | COM/EXE、または同梱BASICでBASサンプルを起動 |
| F1、F10 / Q / Esc | ヘルプ、DOSへ終了 |

入力欄はCtrl-Uでクリア、Enterで確定、Escで取消できます。
既存ファイルには上書きしません。コピーの失敗や取消時は未完成の保存先を除去します。
ファイル・空ディレクトリの削除は確認が必要です。

FD-cloneのような操作を持つ独自のMIT実装です。ASCIIの8.3ファイル名、各パネル256件まで。
再帰コピー・一括選択・編集・アーカイブ・長い名前・日本語表示には対応しません。
同梱DOSの対応範囲はA:の1232 KiB FAT12 FD、WebNP2、386以上です。

[詳細な操作説明](../public/msdos4/FILER.txt)はディスク内の`FILER.TXT`にもあります。
[全ライセンス](../public/msdos4/LICENSE.txt)と`LICENSE.TXT`には各MIT通知、
`FILERLIC.TXT`にはファイラーの通知を格納しています。

実装とビルド手順は[MS-DOSのファイラー](https://github.com/kumakumapon/MS-DOS/blob/b66b6dc6b5531cff4cc5d18bd38e83c19b9055ff/docs/filer.md)にあります。
[manifest.json](../public/msdos4/manifest.json)は出典コミットとイメージ・各ファイル・
共有ゲスト検証スクリプトのハッシュを記録します。以前のFDも保存URLのために保持します。

取り込みは既存の`scripts/update-msdos4-retrobasic.py`を使います。検証済みのDOS+BASICの
ビルドを照合し、同じDOS出典からFD98・説明・通知をビルドして加えます。
`scripts/verify-msdos4.mjs`は通常の起動ボタンから、表示・コピー・上書き拒否・名前変更・
移動・ディレクトリ操作・削除の取消と確認・COM/BASIC起動・DOS復帰を実際のキー入力で確認し、
ゲストが書いたバイトを読み戻します。MS-DOS側CIはIBM PC版もQEMUで検証します。
