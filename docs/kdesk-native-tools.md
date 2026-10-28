# KDESKのEXEツールとDOSウィンドウの応答改善

FD98（ファイラー）、EDIT98/EDIT（テキスト編集）、CPANEL（設定）、
KVIEW（画像表示）、KPAINT（画像編集）をMZ EXEへ移行しました。
実行コード・データ・スタックを分離し、DOSの再配置とPSPからの引数取得を
使います。生成ディスクから同名の古いCOMを除去します。

## 操作

KDESKのランチャー、Ctrl+K検索、Filesの関連付けから起動できます。
既存の編集・保存・設定変更・画像操作を使えます。終了すると追加のキー入力を
待たずにデスクトップへ戻り、画像ツールからマウス位置も引き継ぎます。
実DOSから `EDIT FILE.TXT`、`KVIEW COLORS.BMP` などで直接実行することもできます。

KDESK/386では標準ツールを[ウィンドウアプリ](kdesk-window-tools.md)として開き、
他のGUIアプリやDOSセッションと同時に操作できます。通常のKDESKや実DOSから
起動する単体EXEは全画面で動作し、終了後にデスクトップへ復帰します。
V86から単体の全画面EXEを起動する場合は、ランチャーかFilesから開く案内を表示します。
独立V86 EXEアプリは引き続き2セッションで実行できます。

## 応答改善

- DOSサービスの処理を、最大8スライスまたはゲスト時計10 msの範囲で続けます。
  各スライスの間で実行対象、優先度、CPU制限、仮想タイマーを再評価します。
- 他のウィンドウに隠れていないDOSウィンドウは、変化した文字と状態だけを描画します。
  重なり、移動、ダイアログでは通常の画面合成を使います。
- 長文出力時の仮想テキストVRAMのスクロールを一括転送に変更しました。

エミュレータのCPU速度は変更しません。DOSファイル処理は直列化され、
V86セッションのディスクは読み取り専用のままです。同期ファイルI/O自体に
10 ms以上かかった場合は、その要求が戻った時点でGUIへ制御を返します。

## ビルド・検証

`scripts/prepare-msdos4-cpanel-ci.sh` が固定したMS-DOSコミットから全ツールを
ビルドし、通常版・K386版のコピーを生成します。オリジナルのカーネル、
COMMAND、ライセンスの出自を保持します。

```sh
bash scripts/prepare-msdos4-cpanel-ci.sh
npm test && npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --base /webnp2/
WEBNP2_NO_SANDBOX=1 node scripts/verify-native-tools.mjs http://127.0.0.1:4173/webnp2/ test-results/native-tools
WEBNP2_NO_SANDBOX=1 node scripts/verify-native-tools.mjs http://127.0.0.1:4173/webnp2/ test-results/native-tools-cirrus cirrus
WEBNP2_NO_SANDBOX=1 K386_LATENCY_GATE=1 node scripts/measure-k386-shell.mjs http://127.0.0.1:4173/webnp2/ test-results/shell-latency
```

追加E2EはMZヘッダー、保存したテキスト/BMP/CONFIG、セッションの世代・メモリ、
再開後のCPU進捗、差分描画と全体描画のピクセル一致、既存ファイル保持を検査します。
応答測定は同じ `clk=8` で別セッションのCOUNTERを動かし、ECHO/DIR/TYPEを
各3回実行してJSONに記録します。CIでは中央値に余裕を持たせた上限を設けます。


ローカルChromium 151、`clk=8`、256色、別セッションでCOUNTER実行中の
測定例です（各3回の中央値、ブラウザ経由のキー入力を含む）。

| コマンド | 変更前 | 変更後 |
| --- | ---: | ---: |
| ECHO | 6.43秒 | 2.09秒 |
| DIR *.EXE | 43.55秒 | 7.68秒 |
| TYPE KDESK.TXT | 45.19秒 | 12.58秒 |

比較ソースは変更前 `25f2e46`、変更後 `e9d04e5` です。変更後は移植した
EXEもDIRの列挙対象に含みます。実行環境によって時間は変わるため、CIでも
同じ操作を再測定し、バックグラウンドのCPU進捗とともに記録します。
