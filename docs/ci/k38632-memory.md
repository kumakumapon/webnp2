# K38632: XMSメモリとPM32中断・再開

MS-DOS Issue #31のメモリ・実行継続段階です。実験版イメージの
`K32MEM.EXE` は、実DOSから独立したRing 3実行層を起動します。
XMSの4 MiB予算とアラインメント用4 KiBを確保・ロックし、組み込みの
32ビットコードが2 MiBの配列を通常ポインタで直接処理します。

実験版を16 MiBで起動し、文書を保存してF10でKDESKを終了します。
実DOSで `K32MEM` を実行し、完了後は `KDESK` でデスクトップへ戻れます。
既存のV86所有者がいるKSH内からは実行を拒否します。

引数F/C/K/S/Pはデータガード・コード書き込み・監視層読み取り・スタックガード・CLIの
保護違反試験です。Tは64量子の時間枠、BはEsc操作で無限ループを終了します。
期待した終了理由と回収を確認できた場合にDONE、想定外はFAILと表示します。
4 MiB構成ではXMS不足として拒否し、PMへ移行しません。

## ビルド・検証

```
bash scripts/prepare-msdos4-cpanel-ci.sh
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --base /webnp2/
CHROMIUM=/usr/bin/chromium WEBNP2_NO_SANDBOX=1 \
  node scripts/verify-k38632-memory.mjs http://127.0.0.1:4173/webnp2/ test-results/k38632-memory
```

CI `k38632-memory` は実CPUフレームとデータサンプル、2 MiB全体のチェックサム、
実ページテーブルと回収後の無効化、XMS空き容量・最大ブロック・A20・CR0/CR3・
記述子・フラグ・PICの復元を検査します。各終了経路、再利用時のゼロ初期化、
実メモリ不足、KDESK/Memo/2 V86の復帰、ディスク全バイト不変も確認します。
記録とスクリーンショットは `k38632-memory-playwright-validation` に保存します。

## 範囲

1つの独立したPM32所有者と組み込み診断コードを実装した段階です。
外部ELF32ローダー・SDK・汎用ヒープAPI、PM32/V86の同時スケジューリング、
KDESK内のPM32ウィンドウは後続段階です。4 MiB予算すべてをアプリへ公開するものでは
なく、現在の固定マップはコード・2 MiB配列・制御ページ・スタックです。
386のNXやFPU/SIMDコンテキスト共有は前提にしていません。

モジュールの責務、アドレス配置、76バイトの保存コンテキスト、1024バイトのCPU記録形式は
MS-DOS `tools/k38632/MEMORY.md` を参照してください。
