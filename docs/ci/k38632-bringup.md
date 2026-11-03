# K38632 第1段階：Ring 3・割り込み・DOS復帰

MS-DOS [Issue #31](https://github.com/kumakumapon/MS-DOS/issues/31) の最初のCPU技術検証です。
同梱の `K32CPU.COM` は独立した診断プログラムで、実際の32ビットRing 3コード、
ページング、PC-98のIRQ0と保護例外を実行してDOSへ戻ります。
製品用PM32ローダ・SDK、PM32とV86の同時スケジューリング、32ビットGUI APIは後続段階です。

## 使用方法

KDESK/386実験版イメージ（16 MiB、FDXMS286、EMM386なし）を起動します。
保存が必要な文書を処理してF10でKDESKを終了し、実DOSプロンプトで `K32CPU` を実行します。
成功時は `K32CPU PASS: Ring3 PM32, paging, IRQ0, PF, GP, DF, DOS return` と表示します。
再実行するか、`KDESK` でデスクトップへ戻れます。

KSHのV86ウィンドウから呼び出した場合は、既存のプロテクト/V86所有者を検出して拒否し、
シェルへ戻ります。診断の実行は実DOSから行ってください。IRQ0がマスク済み・未使用である
標準PC-98環境が必要です。

## 検証する5ケース

| ケース | 動作 | 検証内容 |
| --- | --- | --- |
| 正常終了 | CPL3からDPL3のINT 30hゲートを呼ぶ | CPL3→CPL0→実DOSへの復帰 |
| タイマー | ユーザーコードが無限ループ | 実PIT IRQ0による中断、PICのin-service bit 0 |
| #PF | 未マップのC00000hを読む | CR2、ユーザー読み取りのエラー4、隔離と復帰 |
| #GP | CPL3/IOPL0でCLI | 特権違反と復帰 |
| #DF | #PFゲートを非presentにして未マップ領域を読む | #PF送出中の#NPからCPUが生成する二重例外、エラー0 |

すべてVM=0で実行します。PC-98ではIRQ0と#DFがベクタ8を共有するため、VMビットだけでは
識別できません。診断専用GDTのCS値と保存フレームのIF位置を使って区別し、IRQ0は実PICの
in-serviceビットでも確認します。PICベクタの再設定は行いません。
この識別は専用GDTと「Ring 0ではIFを落とす」という契約に依存するため、汎用ランタイムへ
無条件に流用するものではありません。

ユーザー線形アドレス800000hに読み取り専用コード、801000hにRWデータ、802000hに未マップの
ガード、803000hにRWスタックを配置します。物理ページは診断自身のDOS割り当て内にあります。
この段階ではXMSから数MiBを割り当てる32ビットアプリ用メモリ管理は追加していません。

## ビルド・E2E

MS-DOS側は `make -C tools/k38632 all test`。既存の `tools/k386 all test` からも実行されます。
WebNP2は `scripts/prepare-msdos4-cpanel-ci.sh` の固定ソースから診断を含むイメージを生成します。

```
bash scripts/prepare-msdos4-cpanel-ci.sh
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --base /webnp2/
CHROMIUM=/usr/bin/chromium WEBNP2_NO_SANDBOX=1 \
  node scripts/verify-k38632.mjs http://127.0.0.1:4173/webnp2/ test-results/k38632
```

実CPUが残したCPL/CS・VM/PE/PG・CR3・例外フレームと、実ページテーブルを検査します。
CR0/CR3/GDTR/IDTR/フラグ/PICマスクの復元、異なるハードウェア時計タグでの反復実行、
その後のKDESK再起動・2つのV86カウンタとメモの共存、V86内での所有権拒否、GUI終了後の
再実行、FAT12イメージの全バイト不変を確認します。

CI `k38632` は記録・スクリーンショットを `k38632-playwright-validation` に保存します。
既存のV86、XMS/XARRAY、高色数表示、日本語入力、GUI、ネイティブツールの検証も継続します。
詳細なレコード形式とハードウェア前提はMS-DOS `tools/k38632/README.md` に記載しています。
