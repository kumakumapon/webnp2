# K38632: 外部EXEローダーとC SDK

実験版イメージに `K32RUN.EXE` と、別途ビルドしたMZスタブ＋静的ELF32の
アプリを同梱します。16 MiB・FDXMS286・EMM386なしで起動し、文書を保存して
F10で実DOSへ戻り、`K32RUN HELLO32.EXE` などを実行します。

| アプリ | 検証内容 |
| --- | --- |
| HELLO32.EXE | Cの文字出力・yield・時刻取得、終了コード42 |
| MEM32.EXE | 64 KiB超のファイル、4 KiB超のコード、2 MiB BSSのゼロ・パターン・チェックサム |
| BADPTR32.EXE | カーネルポインタ・オーバーフロー・ガード越境・不正APIの拒否 |
| FAULT32.EXE | 実際のユーザー保護例外からの回収 |
| SPIN32.EXE | 無限ループのIRQ0中断、Esc終了、`K32RUN /T SPIN32.EXE` の64量子上限 |

アプリを直接DOSから実行すると、短いMZスタブが共通ランナーの使用方法を表示します。
V86シェルはこの形式を拒否し、K32RUN自体も既存のPE/V86所有者を検出して拒否します。
今回は単独PM32実行であり、PM32/V86同時実行・PM32 GUI・ヒープ・入力やファイルAPIは後続です。

CIは固定したMS-DOSコミットからイメージを生成します。

```
bash scripts/prepare-msdos4-cpanel-ci.sh
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --base /webnp2/
CHROMIUM=/usr/bin/chromium WEBNP2_NO_SANDBOX=1 \
  node scripts/verify-k38632-loader.mjs http://127.0.0.1:4173/webnp2/ test-results/k38632-loader
```

新規ジョブ `k38632-loader` は実CPUフレーム・ライブPTE・回収後の無効化、
ロードしたユーザーデータ、API/終了状態、実際の不正EXE/ELF拒否、メモリ不足、
GUI復帰とディスク全バイト不変を検査します。成果物は
`k38632-loader-playwright-validation` です。従来の14ジョブも継続します。

ビルド用SDK、プログラムヘッダーに基づく検証、システムコールABI、メモリ配置と
CPU記録の詳細は、MS-DOS `tools/k38632/SDK.md` を参照してください。
