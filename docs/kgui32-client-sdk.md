# KGUI32 graphical client SDK

KGUI32のWelcome画面から、独立した32bitアプリの電卓・時計・DOS Shellを起動できます。
既存の2枠を使い、GUI＋GUI、GUI＋DOSを組み合わせます。空き枠がない場合は開始を拒否し、
実行中のアプリを置き換えません。F2またはCtrl+Kでランチャーへ戻ります。

- 電卓: 既存KDESKの固定小数点計算を再利用。ボタンまたは `6*7=` 等のキーで操作。
- 時計: DOSの現在時刻を表示。ボタンまたはTで12/24時間表示を切り替え。
- Qでアプリ終了。終了したタスク枠はAgainで再起動可能。タイトルバーXは枠ごと閉じます。
- 移動・右下グリップによるサイズ変更、最小化・タスクバー復元、停止・再開・終了に対応。
- Run/Ctrl+Lで別のEXEを起動する場合は、先にEnd。例: `KGCALC.EXE`、`KGCLOCK.EXE`。
- Tab、F2/Ctrl+K、Ctrl+L/P/R/E、F10はデスクトップの予約操作。それ以外は選択先へ転送。

PEGCは640×400/256色、Cirrusは800×600/RGB565。拡張メモリ16 MiB、PM32各4 MiB、
GUI専用4 MiB、既存の読み取り専用DOSサービスを維持します。通常KDESKの既存機能も
別途利用できます。保存済みディスクやDOSカーネルは変更しません。

## 実行と描画

KGCALC.EXE/KGCLOCK.EXEはGUI本体の内部関数ではなく、それぞれ私有CR3・メモリ・
スタックを持つCPL3プロセスです。描画・入力処理も各アプリで実行します。デスクトップは
アプリが送る最大40個の矩形・ASCII文字・ボタン命令を保持し、ウィンドウ内へ合成します。
マウス入力は保持されたボタンのIDと座標を対象アプリだけへ届けます。VRAM・I/Oや他の
アプリのポインタは渡しません。背景/最小化中もアプリは実行を継続します。

ネイティブSDKはMS-DOS `tools/kgui32/sdk/`、仕様は
[CLIENT-SDK.md](https://github.com/kumakumapon/MS-DOS/blob/main/tools/kgui32/CLIENT-SDK.md)。
クライアントはABI 0101hのMZ＋ELF32形式にfeature bit 32を指定し、検証付きsyscall 13を
使います。デスクトップ専用のbit 16や呼び出し64〜72への権限は与えません。

KGUILDRの一時的なINT 2Fサービスが、ホストの付与した実スロット・世代とウィンドウIDを
検証して命令を受け取ります。仲介中にDOS・BIOS・再スケジュール・描画を呼びません。
終了/#PF/Endでは対象のID・イベント・私有メモリを回収し、GUI終了時には割り込みベクタと
専用8 KiB領域も元へ戻します。古い世代や他アプリのID、不正なサイズ・座標・ポインタは
描画データを変更する前に拒否します。GUI不在時はクライアントの起動を拒否します。

## ビルドと検証

`scripts/prepare-msdos4-cpanel-ci.sh` の固定cleanコミットから、通常版→KDESK/386→KGUI32
を生成します。KGUI32にKGCALC.EXE/KGCLOCK.EXEと検証用KGBAD.EXEを追加します。
生成済みイメージ・manifest・ライセンス出力はコミットしません。

```
bash scripts/prepare-msdos4-cpanel-ci.sh
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
WEBNP2_NO_SANDBOX=1 node scripts/verify-kgui32-clients.mjs http://127.0.0.1:4173/ test-results/kgui32-clients-pegc pegc
WEBNP2_NO_SANDBOX=1 node scripts/verify-kgui32-clients.mjs http://127.0.0.1:4173/ test-results/kgui32-clients-cirrus cirrus
```

CIでは既存のfoundation/text-sessionと一緒に、両表示モードで実CPU・私有RAM、電卓の
キー/マウス、時計の背景進行、入力分離、サイズ変更、停止/再開・最小化、14個の実CPL3
不正要求、実#PF/再起動、GUI＋DOS、通常終了/再起動、ベクタ・通常/XMS回収、全FAT12の
一致を検査します。Nativeの純粋ポリシーテストとEXEパーサ・境界検査も維持します。

初版は1アプリ1キャンバス、2つの混在枠、ASCIIと矩形・ボタンです。テキスト入力/メニュー
部品、日本語/IME、クリップボード、画像サーフェス、保存/共有書き込み、枠やヒープの拡大は
後続段階です。常時保護モードで動く新カーネルやWindows互換APIは追加しません。


SDK2は互換なopt-in入力・部品とFilesを追加します。操作と制限は
[kgui32-browser.md](kgui32-browser.md)を参照してください。既存SDK1 EXEは継続対応します。
