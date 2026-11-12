# KGUI32のHDD単独起動

通常のKGUI32起動と800×600起動は、新規生成した起動用HDDだけを接続します。
FD1/FD2は不要です。「FD互換起動」は全アプリ入りの従来FDを使う別の選択肢です。
16 MiB、2実行枠、PEGC/Cirrusの構成を維持します。

HDD起動時のDOSドライブはA:です。システムとローダーはルート、6アプリはAPPS、
文書はA:\WORKにあります。Editorの保存先情報はHDDとして表示されます。
DOS Shellから `CD \APPS`、`TYPE A:\WORK\NOTE.TXT` などを使えます。
V86のディスク操作は読み取り専用で、PM32 Editorの限定Work保存とは別の経路です。

保存した文書を残すにはHDDをTHDとしてエクスポートし、次回そのHDDを接続します。
起動システム・APPS・Workを同じイメージに保持し、FDなしで再起動できます。
古いAPPS/Work用データHDDは自動的には起動用になりません。対応する従来FDとの
組合せを継続します。既存利用者の媒体を更新・修復・フォーマットしません。

## 起動と配布の契約

PC-98 IPLと第2段ローダーは、SASI unit 0の専用KHD98形状を対象とします。
パーティション・BPB・IO.SYS/MSDOS.SYSのサイズ・連続FATチェーンを確認してから
システムを読みます。不適合は `H1` または `HDD BOOT ERROR` で停止します。
起動ローダーは媒体へ書き込みません。任意の既存HDD形式に対する汎用起動ではありません。

HDD専用IO.SYSはMS-DOSのSYSINITソースと既存KHD98トランスポートから生成します。
元のDOS4カーネルとCOMMAND.COMを保持し、CONFIG.SYSで同じボリュームを重複登録しません。
実DPBと常駐ドライバ記録から検証したA:を、APPS検索とWork保存へ接続します。

manifestの `standalone_hdd` が単独起動用イメージ・全体ハッシュ・システムファイル・
OEM情報を記録します。`application_distribution` は従来FD＋データHDDの組合せ、
トップレベルの `image` は完全FDです。いずれも別々の生成物として維持します。

## 生成・検証

`bash scripts/prepare-msdos4-cpanel-ci.sh` が固定nativeソースを取得し、HDD用OEM、
従来FD、APPS HDD、単独起動HDDを生成します。ローカルではDOSBoxが必要です。
別配置なら `DOSBOX` と `JWASM` を指定できます。CIの依存導入はHTTPSミラー選択・
厳格なAPT update・時間制限を使い、失敗を古い索引で継続しません。

専用GitHub ActionsはPEGC/Cirrusそれぞれで次を検証します。

- 起動メニューの配布リンク、FDなし起動、実CPL3のFiles/Editor、A: HDD Work保存、
  エクスポートとコールドブート、実DOSでの境界・64K跨ぎ・書込検証・部分I/Oエラー。
- 実V86の長い読込・seek、1501バイト環境の子EXEC、所有DTA/継承ハンドル、書込拒否、
  PM32同時進行、強制終了・実CPU例外・再起動時の回収と媒体全体の不変性。
- 不適合パーティション/BPB、欠損IO.SYS、破損FAT、範囲外記述子、第2段破損の起動拒否と
  媒体全バイト保持、およびHDDなしの明示的FD互換起動。

GUI終了ではDOS/XMS/ハンドル/ベクタの完全回収を確認します。ブラウザE2Eは
GitHub Actionsで実行し、このチャットでpreviewや代替配信サーバーを起動しません。
native契約は [BOOT.md](https://github.com/kumakumapon/MS-DOS/blob/main/ports/pc98/hdd/BOOT.md) を参照してください。
