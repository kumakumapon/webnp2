# KGUI32 HDD保存基盤

KGUI32の標準起動リンクは[HDDアプリ配置版](kgui32-hdd-apps.md)のFD＋HDDを指定します。
この文書は保存APIと、従来の完全FD＋空のWork HDDによる回帰検証構成も説明します。
Editorの保存と共通Open/Save Asは、ゲスト側で認識したHDDのWORKを使います。
通常は **B:\WORK**、空きは初期状態で41,426,944バイトです。
既存KDESKの標準イメージ、ユーザーが保存済みのディスクは置き換えません。

## 起動と保存

1. 起動画面でKGUI32（PEGCまたはCirrus）を選びます。メモリは16 MiBです。
2. Welcome → Editorを開き、Ctrl+Sで `NOTE.TXT` などを保存します。
3. 共通ダイアログの `B:\WORK / HDD` と空き容量を確認します。
   `temp` は文書をクラスタ単位で切り上げた一時コピーの必要量です。
4. Ctrl+OはHDDのWorkから開きます。Rootで従来の読み取り専用A:へ移動できます。
5. ディスク書き出しで **HDD（THD）** を保管し、次回はそのHDDを同じGUI FDと接続します。
   ページ更新や同梱オリジナルへのリセット前にバックアップを取ってください。

生成後の `public/kgui32/manifest.json` にFD/HDD名とSHA-256があります。
手動指定では次のURLを使います。Pagesでは `/webnp2/` 以下です。

```text
/?fd1=./kgui32/<image>&hdd=./kgui32/<workspace_hdd.image>&run=1&mem=16
```

Cirrusは `&video=cirrus` を追加します。`hdd` を省いたFDのみのURL
（`KGUI32_FD_BOOT_URL`）も使え、保存先は明示的に `A:\WORK / FD` になります。
前段のHDD検証イメージも接続でき、WORKがなければDOSで作成します。
既存ファイルを消したり、再フォーマットしたりしません。

## 境界と互換性

書き込み先の選択はPC-98ゲストのK32HOSTが行います。DOSのDPB経由でKHD98の
常駐レコード、バージョン、ドライブ番号、対応ジオメトリを検査します。
名前やラベルだけで別のディスクを保存先にはしません。非対応HDDは登録されずFDへ
フォールバックします。認識したHDDのWORKがファイルだったり利用不能だったりする
場合はHDD側のエラーを表示し、別ディスクへ黙って保存しません。

対象は8.3 TXT・ASCII・最大64 KiBです。アプリから任意のパスやドライブを指定できません。
SDK4のfeature 128、既存の要求形式を維持し、任意のINFO操作5を追加しています。
旧ホストではINFOが-38を返し、ダイアログは従来のA:表示を使います。
新しいホストは実際のDOS空き容量を返し、SAVEの直前にも再検査します。
ディレクトリ拡張や別タスクの保存で表示後に空きが減る場合も、実際の書き込み結果を
検査し、文書・履歴・元ファイルを保持します。上書きでは旧ファイルを残したまま
一時コピーを作るため、その分の空きが必要です。

FAT管理はDOSだけが行い、動作中にホストからFATを書き換えません。
DOS仲介中は他タスクが待機します。同じ書き込み可能HDDを複数のマシンで共有しないでください。
TMP/BAKの復旧手順・電源断の制限は [kgui32-save.md](kgui32-save.md) を参照してください。

## ビルドとE2E

```sh
bash scripts/prepare-msdos4-cpanel-ci.sh
npm ci
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort --base /webnp2/
# 別ターミナル
WEBNP2_NO_SANDBOX=1 node scripts/verify-kgui32-hdd-workspace.mjs http://127.0.0.1:4173/webnp2/ test-results/hdd-workspace-pegc pegc
WEBNP2_NO_SANDBOX=1 node scripts/verify-kgui32-hdd-workspace.mjs http://127.0.0.1:4173/webnp2/ test-results/hdd-workspace-cirrus cirrus
```

既存のソース固定スクリプトで通常版→K386→KGUI32の順に生成します。
GUI FDにKHD98.SYSとCONFIG設定を追加し、同じ契約の新規THDにHDD.IDと空のWORKを
配置します。新規ファイルだけを生成し、ユーザーのディスクを開きません。
生成物はPages/CIへ同梱し、バイナリをGitへコミットしません。
manifestはネイティブSHA・dirty・FD/HDDハッシュ・初期空き容量を記録します。

専用CIはPEGC/Cirrusの実ブラウザで次を検査し、JSON・スクリーンショット・保存THDを添付します。

- Editorの保存・上書き・Save As・Open・取消・Undo/Redo、独立した2エディタの競合と別名救出。
- 実CPL3/CPU、異なるCR3/物理RAM、64 KiBの新規保存と3回上書き、全バイト読込とコールドブート。
- 実際に書き出したTHDの両FAT・全クラスタ所有権・ファイル内容・保護領域、FDのハッシュ不変性。
- 満杯、事前検査後の実DOS短い書き込み、保護ファイル、WORK名のファイル、HDD不在・非対応。
- 旧HDDへのWORK作成、実INT1Bh書き込み失敗、ファイルハンドル・XMS・DOSメモリ・割り込みベクタの回収。

`HDDFLT.COM` は失敗検証専用で、通常AUTOEXECは起動しません。テストが複製FDへ追加し、
最初のHDD物理書き込みだけを拒否します。フィクスチャのFAT変更は起動前だけです。
従来のFD保存・GUI・KDESKテストも維持します。

アプリのHDD配置・起動は[HDDアプリ配置版](kgui32-hdd-apps.md)で対応します。
FilesのWork閲覧とEditor起動は[Files／Editor連携](kgui32-files-editor.md)に対応しました。
A:ルートは引き続き読み取り専用です。復旧UI、任意HDD形式、HDD単独起動は後続段階です。
