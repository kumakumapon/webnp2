MS-DOS 4.0 + RetroBasic for PC-98 / WebNP2
=======================================

日本語
------
kumakumapon/MS-DOS の v4.0 カーネルと COMMAND.COM をソースからビルドし、
PC-98 用 BIOS / IPL とネイティブ版 RetroBasic を含めた
1232 KiB FAT12 の起動FDです。両ソフトウェアの MIT License 全文は、この
ディレクトリの LICENSE.txt とディスク内の LICENSE.TXT に格納しています。
DOSLIC.TXT は Microsoft のライセンスです。ビルドのリビジョンと各ファイルの
SHA256 は manifest.json に記録しています。

起動画面の「MS-DOS 4.0 + RetroBasic で起動」を選択します。
A> が表示されたら VER / DIR を試すか、次のコマンドを実行してください。

  RBASIC                 BASIC の対話モード（SYSTEM で DOS に戻る）
  RBASIC PRIMES.BAS       素数のサンプル
  RBASIC GRAPHICS.BAS     PC-98 グラフィックスのサンプル
  RBASIC FILEIO.BAS       ファイル入出力のサンプル（SEQ.TXT を作成）

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
kernel and COMMAND.COM, a PC-98 OEM BIOS/IPL, and the native RetroBasic port.
Both components use the MIT License. Full notices are in LICENSE.txt alongside
this file and LICENSE.TXT on the disk; DOSLIC.TXT is Microsoft's notice.
manifest.json records build revisions and image/file SHA256 hashes.

Select "Start with MS-DOS 4.0 + RetroBasic" in WebNP2. At A>, try VER and DIR,
RBASIC for interactive BASIC (SYSTEM returns to DOS), or RBASIC PRIMES.BAS,
RBASIC GRAPHICS.BAS, and RBASIC FILEIO.BAS. The last sample creates SEQ.TXT.
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
