# KGUI32 text-session milestone

KGUI32の専用CPL3デスクトップへ、既存の2つのV86/PM32実行枠を統合します。
ゲスト内のGUIが各ウィンドウの合成・フォーカス・コマンド欄・サイズ変更・スクロールを
管理し、KGUILDRの実モード仲介層が世代番号と所有権を検証して既存スケジューラを操作します。
隠れたウィンドウの画面キャッシュも更新し、完全に隠れた部分の描画を省きます。
背景タスクの実行後から次の割り当て間隔を測り、GUIの描画時間を確保します。

操作方法は[kgui32.md](kgui32.md)、API構造とエラー・所有権の契約は
[MS-DOS側のSESSIONS.md](https://github.com/kumakumapon/MS-DOS/blob/main/tools/kgui32/SESSIONS.md)を参照してください。

| 機能 | 今回の範囲 |
| --- | --- |
| 起動・表示 | KSH×2、KSH/COUNTER＋COUNT32、VIEW32＋COUNT32。80×25文字の画面を保持。 |
| ウィンドウ | 移動、サイズ変更、前後関係、最小化、タスクバー復元。 |
| 入力 | 選択先へASCII/PM32ナビゲーションキー。予約操作とアプリのQ/T/Sを区別。 |
| 実行管理 | 作成、終了、停止、再開、成功したルートと引数での再起動。 |
| 障害処理 | 起動失敗で世代・画面を維持。#PF後もGUI/相手を維持して再起動。 |
| 所有権 | 古い世代・別所有者への入力/制御を拒否。GUI終了時も別所有者を維持。 |
| ディスク | A: rootの既存サービス、読み取り専用。全FAT12ハッシュを検査。 |

GUI専用4 MiB、PM32アプリごとに既存4 MiB、実行枠2本、拡張メモリ16 MiBを維持します。
ブラウザのHTML端末、別CPUコア、DOSカーネル改変、共有ディスク書き込みは追加しません。
初版GUI SDKと電卓・時計は[kgui32-client-sdk.md](kgui32-client-sdk.md)を参照してください。
高度なGUI部品、日本語・文字属性、クリップボード、直接GDCを操作するアプリの
仮想化、実行枠の拡大は後続の開発項目です。既存KDESKも別途起動できます。

## 検証と同期

MS-DOS `make -C tools/kgui32 all test` は既存パッケージ/シーン検査と、世代・所有権・
作成失敗・再起動の操作ポリシー、4ウィンドウのフォーカス/重なり/クリップを検査します。
`KGPROOF.COM`は実DOS親から4回GUIをEXECし、事前所有タスクの維持と通常/XMSメモリの
回収を検査します。`sessionapi`は実際のCPL3から不正ポインタ・読み取り専用メモリ・
不正ABI・古い世代・別所有者への操作を発行します。

WebNP2の`verify-kgui32-sessions.mjs`は、各モードの実CPUフレーム/CR3/物理メモリ、
CPUが取得した私有RAM、世代とリソース、文字画面、読み込んだファイル、表示ピクセルを
読み取り、上記の操作と背景実行・障害復旧・全ディスクハッシュを検査します。
`verify-kgui32.mjs`は既存GUIのマウス/描画、GUI自身の#PF/無限ループ、低メモリ拒否と
KDESK電卓への復帰を維持します。どちらもPEGC/CirrusのCIジョブで実行します。

ネイティブソースは`scripts/prepare-msdos4-cpanel-ci.sh`の完全SHAで固定し、通常版→
KDESK/386→KGUI32の順に同じコミットから生成します。KGUI32生成器は元イメージと
ソースコミット・dirty状態の一致を必須にします。生成イメージ・manifest・ライセンスは
CI/Pages成果物で、リポジトリにはコミットしません。保存済みディスクを更新しません。

関連PR: [MS-DOS #39](https://github.com/kumakumapon/MS-DOS/pull/39)、
[WebNP2 #39](https://github.com/kumakumapon/webnp2/pull/39)。
MS-DOSをマージしmain CIの成功を確認した後、WebNP2をマージしてください。
