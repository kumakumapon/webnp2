MS-DOS 4.0 + RetroBasic for PC-98 / WebNP2
=======================================

日本語
------
kumakumapon/MS-DOS の v4.0 カーネルと COMMAND.COM をソースからビルドし、
PC-98 用 BIOS / IPL、ネイティブ版 RetroBasic、二画面の FD Filer、EDIT98 を含めた
1232 KiB FAT12 の起動FDです。各ソフトウェアの MIT License 全文は、この
ディレクトリの LICENSE.txt とディスク内の LICENSE.TXT に格納しています。
DOSLIC.TXT は Microsoft のライセンスです。ビルドのリビジョンと各ファイルの
SHA256 は manifest.json に記録しています。

起動画面の「MS-DOS 4.0 + RetroBasic で起動」を選択します。
A> が表示されたら VER / DIR を試すか、次のコマンドを実行してください。

  RBASIC                 BASIC の対話モード（SYSTEM で DOS に戻る）
  RBASIC PRIMES.BAS       素数のサンプル
  RBASIC GRAPHICS.BAS     PC-98 グラフィックスのサンプル
  RBASIC FILEIO.BAS       ファイル入出力のサンプル（SEQ.TXT を作成）
  FD98                   キーボード操作の二画面ファイラー（F1でヘルプ、F10で終了）
  EDIT MEMO.TXT          Shift_JIS本文の新規作成・編集（EDIT98も同じアプリ）
  TYPE JPHELLO.TXT       日本語表示のサンプル

「…」→「入力」→「入力設定」→「キーボード」でJIS 106/109または従来のUS配列を選びます。
設定は保存します。日本語UIの初期値はJIS、英語UIはUSです。
「テキスト送信」欄でホストOSのIMEを使い、変換・確定後に送信してください。
JISの半角/全角キー、またはShiftキー2回でも欄を開きます。
IMEの変換中キーと確定Enterはゲストに送りません。未対応文字は欄に残して通知します。
同梱DOS 4.0では常駐ヘルパーは不要です。日本語のコマンド名・ファイル名は対象外です。

EDIT98: F2で開く・新規、F3/Ctrl-Sで保存、F4で別名保存、F5で検索、F10で終了します。
矢印で文字単位の移動、Backspace/Deleteで全角を分割せず削除、Ctrl-Zで最後の編集を取り消します。
本文は16 KiBまで、保存はShift_JIS/CRLFです。バイナリ・不正な本文は拒否します。
保存は一時ファイルをcloseしてから置換し、失敗時は元ファイルを保持・復旧します。
復旧パスが表示された場合は内容を確認してください。EDIT.TXTとEDITLIC.TXTを参照します。

ファイラー: 矢印キーで選択、Tabで左右切替、Enterでディレクトリへ移動、
F2で名前変更、F3で閲覧、F5でコピー、F6で移動、F7でディレクトリ作成、
F8で削除（Yで確認）、F9でCOM/EXEまたはBASサンプルを起動します。
保存先は反対側パネルが既定で、既存ファイルには上書きしません。
FILER.TXTに詳しい操作、FILERLIC.TXTにファイラーのMIT Licenseを格納しています。
FD-clone のような操作を持つ独自実装です。ASCIIの8.3ファイル名、各パネル256件まで。
F3は日本語本文の閲覧、Eは選択したファイルをEDIT98で編集します。
再帰コピー、一括選択、アーカイブ、長い名前、日本語ファイル名は未対応です。

対話モードでは 10 PRINT "HELLO" → RUN → SAVE "HELLO.BAS" を試せます。
OPEN/CLOSE、PRINT#/WRITE#/INPUT#/LINE INPUT#、EOF/LOF/LOC/INPUT$ に対応します。
同じ起動URLではディスクへの書き込みを IndexedDB から復元します。
「初期状態に戻す」は配布時のディスクに戻します（変更内容は削除されます）。

対応範囲: WebNP2、386 以上、A: の 1232 KiB FAT12 FD のみ。
HDD/FAT16、2台目のFD、実機、FORMAT/SYS による起動FD作成、日本語 FEP は未対応。
RetroBasic は元の Python 版の一部を C に移植したものです。128行、プログラム
領域4 KiB、変数48個、文字列95文字、配列512要素、同時に開くファイル4個の制限が
あります。MANDEL.BAS は時間がかかり、MANSMOKE.BAS は STEP 32 の軽量版です。
Microsoft による公式の PC-98 移植・サポート・推奨を示すものではありません。

English
-------
This 1232 KiB FAT12 floppy contains the source-built Microsoft MS-DOS 4.0
kernel and COMMAND.COM, a PC-98 OEM BIOS/IPL, native RetroBasic, FD Filer, and EDIT98.
All components use the MIT License. Full notices are in LICENSE.txt alongside
this file and LICENSE.TXT on the disk; DOSLIC.TXT is Microsoft's notice.
manifest.json records build revisions and image/file SHA256 hashes.

Select "Start with MS-DOS 4.0 + RetroBasic" in WebNP2. At A>, try VER and DIR,
RBASIC for interactive BASIC (SYSTEM returns to DOS), or RBASIC PRIMES.BAS,
RBASIC GRAPHICS.BAS, and RBASIC FILEIO.BAS. The last sample creates SEQ.TXT.
FD98 starts the two-pane filer: arrows select, Tab switches panes, Enter opens
directories, F2 renames, F3 views, F5 copies, F6 moves, F7 creates directories,
F8 deletes with confirmation, F9 launches COM/EXE or BAS samples, and F10 exits.
Destinations default to the other pane. Existing files are never overwritten.
F1 shows help; FILER.TXT is the full guide and FILERLIC.TXT is its MIT notice.
This original implementation has FD-clone-like operations, ASCII 8.3 filenames,
and a limit of 256 entries per pane. F3 views Japanese text; E opens EDIT98.
Recursive copy, multi-selection, archives, long and Japanese filenames are unsupported.

Select Japanese JIS 106/109 or the existing US layout in More > Input > Input
Settings > Keyboard. The choice is saved (Japanese UI defaults to JIS, English
UI to US). Open Send Text (also Shift twice or the JIS half/full-width key),
use your OS IME, commit conversion, then Send. Composition keys and the
confirming Enter stay in the browser; unsupported Shift_JIS text is retained
for correction. This DOS 4.0 disk needs no resident input helper.
Run EDIT MEMO.TXT / EDIT98 MEMO.TXT: F2 Open/new, F3/Ctrl-S Save, F4 Save as,
F5 Find, F10 Quit. Arrows and deletion preserve whole full-width characters.
Ctrl-Z undoes/redoes the last edit. The limit is 16 KiB, output Shift_JIS/CRLF.
Saving writes/closes a temporary before replacing the original; failures
preserve/restore the original or show a recovery path. See EDIT.TXT/EDITLIC.TXT.
TYPE JPHELLO.TXT demonstrates Japanese console output.
In BASIC, try 10 PRINT "HELLO", RUN, and SAVE "HELLO.BAS".
Sequential file I/O supports OPEN/CLOSE, PRINT#/WRITE#/INPUT#/LINE INPUT#,
EOF/LOF/LOC/INPUT$. Disk writes persist in IndexedDB for the same boot URL.
"Reset to initial state" restores the bundled disk and deletes your changes.

Supported: WebNP2, 386 or later, drive A: with a 1232 KiB FAT12 floppy only.
HDD/FAT16, second floppy, physical hardware, boot disk creation with FORMAT/SYS,
and Japanese input FEP are unsupported. Native RetroBasic implements a subset
of the Python version: 128 lines, 4 KiB program storage, 48 variables, 95-character
strings, 512 array elements, and four open files. MANDEL.BAS is slow;
MANSMOKE.BAS uses STEP 32. This unofficial port does not imply Microsoft
support or endorsement.

MS-DOS source:
https://github.com/kumakumapon/MS-DOS
See the WebNP2 README for the bundled disk update procedure.
