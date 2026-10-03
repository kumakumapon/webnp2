MS-DOS 2.0 for PC-98 / WebNP2
===========================

日本語
------
kumakumapon/MS-DOS の ports/pc98 からビルドした 1232 KiB の起動FDです。
Microsoft MS-DOS 2.00 のカーネル、Command 2.02、PC-98 用 OEM BIOS / IPL
を格納しています。FreeDOS(98) のカーネルや起動セクタは使用していません。
Microsoft が MIT License で公開したバイナリと、この移植のコードを利用しています。
ライセンス全文は同じディレクトリの LICENSE.txt とディスク内の DOSLIC.TXT にあります。
Microsoft による公式の PC-98 版、公式サポート、推奨を示すものではありません。

WebNP2 の起動画面の「MS-DOS 2.0 で起動」を選ぶか、README の起動リンクを開きます。
MS-DOS version 2.00 と A> が表示されます。VER / DIR / ECHO / TYPE / COPY が使用可能です。
ディスクへの書き込みは WebNP2 の IndexedDB に保存され、同じURLで再開できます。
「初期状態に戻す」で配布時のイメージに戻ります（変更内容は削除されます）。

対応範囲は WebNP2、386 以上、A: のみです。HDD、2台目のFD、別ジオメトリ、実機は対象外です。
FORMAT / SYS で起動ディスクを作り直す手順には対応しません。
IBM PC の BIOS・画面・ハードウェアを直接操作するソフトは PC-98 では動きません。
日本語 FEP は含みません。

English
-------
This 1232 KiB boot floppy was built from ports/pc98 in kumakumapon/MS-DOS.
It contains the Microsoft MS-DOS 2.00 kernel, Command 2.02, and a PC-98 OEM BIOS/IPL.
It does not use the FreeDOS(98) kernel or boot sector. The binaries published by
Microsoft and the port are distributed under the MIT License; see LICENSE.txt
alongside this file and DOSLIC.TXT inside the disk. This is an unofficial port
and does not imply Microsoft support, endorsement, or sponsorship.

Select "Start with MS-DOS 2.0" in WebNP2 or use the boot link in the repository README.
The screen shows MS-DOS version 2.00 and A>. VER, DIR, ECHO, TYPE, and COPY work.
WebNP2 saves disk writes in IndexedDB and resumes from the same URL. "Reset to
initial state" restores the distributed disk and deletes your changes.

Supported: WebNP2, 386 or later, drive A: only. HDDs, a second floppy, other disk
geometries, and physical hardware are out of scope. Recreating a boot disk with
FORMAT/SYS is unsupported. Programs using IBM PC BIOS/video/hardware directly
will not run on PC-98. No Japanese input FEP is included.

Source / 出典: https://github.com/kumakumapon/MS-DOS/tree/main/ports/pc98
Details / 詳細: https://github.com/kumakumapon/MS-DOS/blob/main/docs/pc98-webnp2.md
manifest.json records the source commit and SHA256 of the image and each file.
See the WebNP2 README for rebuilding and importing a new version.
