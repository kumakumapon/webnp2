# KGUI32 の Work 管理と起動設定

**Files → Work → Manage** から、名前・サイズ・更新日時・種類の表示と並べ替え、
フォルダの作成、ファイルのコピー・移動・名前変更ができます。コピーと移動の宛先は
Work 内の DOS パスです（例 `DOCS\COPY.TXT`）。Tab・矢印・Enter かタップで操作できます。

Delete で確認してからごみ箱に移し、元のフォルダで Trash → Restore を選ぶと復元できます。
同名の項目がある場合は復元を保留します。対応する削除対象はファイルと空のフォルダです。
Work は検証済み HDD、FD 単独起動では `A:\WORK` です。保存・復元した結果を別の
ブラウザーセッションでも使うには、変更した媒体を保存またはエクスポートします。

**System → Settings** または **F9** で XMS／EMS、FILES／BUFFERS、FD98 の自動起動を
編集します。Apply CONFIG と Apply AUTOEXEC で個別に保存し、再起動すると反映されます。
各起動ファイルの編集上限は、CPANEL と同じ 2 KiB です。
XMS の無効化、または EMS の有効化は、再起動後に KGUI32 を起動できなくなる可能性が
あるため、保存前に確認します。媒体のその他のファイルは保持します。

**Memo（F4）** は Editor で `WORK\NOTE.TXT` を開きます。初回は保存時に作成します。
**System** では実行枠ごとのプログラム名と状態を確認し、行をタップして切り替えられます。

配布用 HDD の `APPS` と完全版 FD に Settings（`KGSET.EXE`）が入ります。FD の容量は
K386 の検証用プログラムと EDIT.EXE の別名を元の配布媒体に置いて確保しています。
CI は PEGC と Cirrus で実機エミュレーション上の操作を行い、エクスポートした FAT16／FAT12
からファイル本文、復元先、関連する TMP／BAK および起動ファイルの差分を確認します。

[ネイティブの操作・制限](https://github.com/kumakumapon/MS-DOS/blob/main/tools/kgui32/STANDARD-APPS.md)
