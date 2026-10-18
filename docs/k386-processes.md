# K386: DOSプロセスと私有メモリ

KDESK/386の実験用イメージは、ゲスト側で2つのV86セッションを実行します。
各セッションには640KiBの通常RAM、PC-98テキストVRAM、CPU/スタック、IVT、
カレントディレクトリがあります。メモリはロックしたXMSに確保し、K386自身と
実DOSカーネルはスーパーバイザページで保護します。ブラウザ側でDOSを再実装
する方式ではありません。歴史的DOS/COMMANDとNP2kaiコアの変更もありません。

## 起動と操作

CIで生成したページの **KDESK/386（実験版）で起動** を選びます。
実験用リンクは拡張メモリ16MBを指定します。FDXMS286を読み込み、EMM386は
読み込みません。通常イメージのKDESKとXMS/EMS構成は引き続き利用できます。

- Ctrl+N / Ctrl+O: DOS 1 / DOS 2。初期シェルはKSH。
- Ctrl+L / Run: ルートプログラムを入れ替え。`COMMAND.COM` で元のDOSシェル。
- Ctrl+P / Ctrl+R / Ctrl+E: 停止 / 再開 / セッション終了。
- Ctrl+T: タスク一覧。ウィンドウ移動、サイズ変更、最小化、スクロールも利用可能。

`COMMAND.COM /C VER` のバージョン表示、対話型COMMANDのVER/ECHO、外部COM
起動は実際のブラウザで確認しています。KSHではHELP/VER/DIR/TYPE/CD/ECHO/
CLS/TIME/EXITを利用できます。`COUNTER` はバックグラウンドでカウントし、
`q` で親シェルに戻ります。フォーカスを切り替えても他セッションは継続します。
対応するDOS機能は限定されているため、一般のDOSソフト全体の互換性は未完成です。

## 今回追加した機能

DOSのAH=48h/49h/4Ahで段落単位の確保、解放、連続領域のサイズ変更を扱います。
最大32個のMCBを信頼できる内部情報として管理し、ゲストが書き換えたMCBから
ホストのメモリ操作を行いません。COMは最大FF00hバイト、MZはコード・必要メモリ・
スタックが私有アリーナに収まる範囲です。オーバーレイは非対応です。

PSP、子専用の環境ブロック、標準のコマンドテール、16個の仮想ハンドルを用意
します。最大4段（ルート＋3子）のEXECに対応し、親のメモリを残したままCPU、
PSP、DTA、IVT、仮想IFを保存・復帰します。読み取り専用ハンドルの継承はDOSの
複製を使い、親子でファイル位置を共有します。CON/NULのI/Oは私有状態で扱います。

PC-98 INT 1Chの100Hzインターバルタイマーは、私有vector 07hとBDA 058Ahを
使います。仮想CLI中の通知を保留し、STI後や入力待ち中に私有スタックへ通知します。
再設定と停止・再開に対応し、親が設定したタイマーは子のEXEC・終了をまたいで
継続します。不正なコールバックは対象セッションだけを終了します。
完全なPIC/PIT/IRQ仮想化ではありません。

## 制限事項

ファイルアクセスはASCIIのA:ディスクパスに限定し、書き込み、作成、削除、
名前変更は拒否します。共有FAT12への並行書き込みは未実装です。DTAの検索継続
情報も検査します。保存済みユーザーイメージをビルド処理が書き換えることはありません。

一般のDOS/BIOS内部構造、TSR、完全な日本語DOS表示・入力、直接GDC/PEGCを操作する
外部アプリの同時描画、ポートI/O、x87/SIMDは未対応です。K386はゲスト内のXMS/EMS
APIを提供しません。既存の保護モード所有者や使用中のIRQ0がある場合は起動を拒否します。
通常ランチャーの前面EXECを使っている間は、GUIによるVMの実行も一時停止します。

## ビルドと検証

`scripts/prepare-msdos4-cpanel-ci.sh` がMS-DOSの完全なコミットSHAを固定します。
同じソースから通常イメージと別のK386イメージを生成し、マニフェストにソースSHAと
イメージSHA-256を記録します。追跡済みのベースイメージは入力として保持します。

```sh
bash scripts/prepare-msdos4-cpanel-ci.sh
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --base /webnp2/
CHROMIUM=/usr/bin/chromium WEBNP2_NO_SANDBOX=1 \
  node scripts/verify-k386-processes.mjs http://127.0.0.1:4173/webnp2/ test-results/k386-processes
```

CIでは通常GUI検査に加え、`verify-k386.mjs`、`verify-k386-shell.mjs`、
`verify-k386-processes.mjs` を別ジョブで実行します。実CPUの例外・ページテーブル、
2つの64KiB超のメモリ領域、4段EXEC、ファイル位置とIVTの復帰、入力待ち中の
タイマー、元のCOMMANDと外部COMの並行実行、KDESK内部アプリとの共存、ディスク
全体のハッシュを検査し、画像とJSONをActionsアーティファクトに残します。

NP2の従来の2MiB主RAMデバッグ領域には、1MiB以上にフォント等の保存領域が含まれ、
XMSの実メモリとは異なります。`k386-inspect.mjs` は低RAMのページテーブルと、
K386が実行中のマッピングから採取したCPU/PSP先頭512バイトの診断結果を使います。
API処理中の一時状態を除外し、読み込み・復帰が完了してから検査します。
アドレスだけを合わせた誤ったRAM検査は行いません。

ネイティブ側の責務、ABI、ページング、ソース由来は
[MS-DOS側の設計書](https://github.com/kumakumapon/MS-DOS/blob/codex/k386-process-memory/tools/k386/DESIGN.md)
を参照してください。完全なDOS互換性を満たすまで開発PRはドラフトとして管理します。
