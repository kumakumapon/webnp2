# KDESK/386 EXEアプリ

KDESK/386のDOSウィンドウ用アプリを、再配置情報・スタック・必要メモリを
持つMZ EXEへ移行しました。標準シェルはKSH.EXEです。COMを単に改名する
方式ではなく、EXE専用の起動処理とKDESK/386アプリABIを使います。

## 操作

- Ctrl+N / Ctrl+O: 独立したシェルを開く、または既存セッションへ切り替える。
- 拡張版の「DOS shell」ランチャー: 空いているウィンドウでKSH.EXEを起動。
- Ctrl+K: `hello`、`background counter`、`keyboard echo`を検索してEnter。
- ファイルアイコンから専用EXEを開くと空きセッションで起動します。
  実行中・待機中・停止中のセッションは上書きしません。両方使用中なら
  TasksまたはDOSウィンドウのCtrl+Eで一つ終了してから開き直してください。
- シェルの`NAME [引数]`はEXEを優先し、存在しない場合にCOMを探します。
  COUNTERはq、ECHOはEscで終了し、元のシェルへ戻ります。
- Ctrl+Lは現在のセッションを明示的に置き換えます。不正なMZや未対応の
  アプリABIは既存セッションのメモリを置き換える前に拒否します。

標準シェル、カウンター、エコー、サンプルKHELLO、およびDOSサービス・
保護機能を検証するプログラムの計18本が専用EXEです。実DOSで動かす診断
ツールやCOMMAND.COM、互換テスト用COMはそのまま残ります。

## アプリ開発とビルド

MS-DOS側の `tools/k386/APPLICATIONS.md` にABI、MZヘッダー、ビルド手順、
全アプリ一覧を記載しています。`hello.c` がCのひな型です。
`app-start.S`、`app.ld`、`sdk.h`、`tools/mz/build.py --k386-app TITLE`で
作成できます。ABI 1.0は実行環境・セッション番号の照会とCPUの譲渡を提供し、
入出力は既存のDOS/PC-98サービスを利用します。

`bash scripts/prepare-msdos4-cpanel-ci.sh` は固定されたMS-DOSコミットを取得し、
通常版と拡張版を再生成します。アプリは `scripts/update-k386.py` が同梱し、
旧V86アプリCOMを除去します。元の起動イメージを直接書き換えません。

```sh
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --base /webnp2/
WEBNP2_NO_SANDBOX=1 node scripts/verify-k386-apps.mjs \
  http://127.0.0.1:4173/webnp2/ test-results/k386-apps
```

追加したCIは実際のMZ・CPUセグメント・PSP・再配置後RAMを調べ、改名した
EXEのファイルアイコン起動、2アプリ並行実行、使用中セッションの保護、
終了・再利用、入力分離、ABI不一致の拒否、ディスクの全バイト不変を検証します。
従来のシェル、4段EXEC、タイマー、メモリ保護、GUIのE2Eも引き続き実行します。

## 対象と制限

今回の専用アプリはテキストアプリです。電卓・時計・メモ・Filesは従来どおり
KDESK.EXE内のGUIタスクです。外部GUIプラグイン用の描画・ウィジェットAPI、
GDC/PEGCを直接扱うアプリの同時描画は未実装です。既存の編集・設定・画像
ツールは[専用MZ EXEツール](kdesk-native-tools.md)としてランチャーから利用できます。

最大2セッション、EXECは4段、共有ディスクは読み取り専用です。
任意のDOS/BIOSプログラムやWindows EXEへの完全互換性はありません。
専用EXEを実DOSから直接実行するとKDESK/386で開く案内を出して終了します。
