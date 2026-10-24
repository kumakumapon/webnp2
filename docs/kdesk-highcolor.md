# KDESK/386 高解像度・65,536色表示

起動画面の **KDESK/386（800×600・65,536色）で起動** を選ぶと、ゲスト側の
Cirrus描画ドライバで800×600・RGB565表示になります。既存の256色起動も選べます。
同じ起動イメージを使い、`video=cirrus`でPC-9821のCirrus機器を有効にします。
ブラウザ上に別のデスクトップを描く方式ではなく、DOSゲストのI/OとVRAMを
NP2kaiがエミュレートし、その出力を表示します。

## 操作と対応範囲

- 起動URLに `&video=cirrus` を追加しても利用できます。`mem=16`も指定してください。
- ウィンドウの移動・サイズ変更・最大化・左右配置・タスクバーとマウスは
  新しい画面サイズを利用します。GUIの文字セルは8×16のままです。
- DOSウィンドウ内の画面は各80×25文字のまま、独立したV86コンテキストで動作します。
- カーソルとドラッグ用画像はRGB565の全ビットを保存します。
- 全画面DOS・画像アプリでは従来の画面モードを使い、KDESKへの復帰で高解像度に戻ります。
- Cirrus機器がない場合、未対応の機種・VRAM容量の場合は従来のPEGC/平面描画を利用します。
- 1024×768のKDESK統合は今回の対象に含めません。外部画像編集アプリの内部画像は
  既存の256色形式です。外部DOSアプリのGDC/PEGC同時描画の仮想化は未実装です。

## 実装

ゲスト側はMS-DOSの `tools/display/cirrus.c` と `tools/window/` に分離しました。
NP2kaiのPC-9821モデル5Ah（CL-GD5430/5434）を使い、ボード・チップとVRAMの
独立性を調べてから表示を切り替えます。4MiBのVRAMのうち、表示面、合成面、
壁紙キャッシュを別々の領域で管理します。画面転送はCirrusのBLTを利用し、
利用できない場合はバンクを切り替えてコピーします。ポーリングには上限があります。
実機アクセラレータでの動作は未検証です。

WebNP2は `USE_CLGD=true`、`CLGDTYPE=90`、`WAB_ANSW=1` を出力します。
WASMコアのパッチは `patches/np2kai-cirrus-display.patch` に保持しています。
画面サイズ追従、SDLのRGB565変換の緑6ビット保持と色順、読み取り専用の
実デバイス状態取得APIを追加しています。バスマウスの移動完了判定は、
ホスト側キューだけでなく8255側の未消費カウンタも確認します。WASM初期化中の
デバッグAPI呼び出しは拒否し、Emscriptenの遅延エクスポートを保護します。APIの色深度表示だけで多色化を判定せず、
実際のキャンバスの全65,536色と原色・緑の最下位ビットを検査します。

## ビルドと同期

`prepare-msdos4-cpanel-ci.sh` のMS-DOSコミット固定で、通常版と拡張版を再生成します。
`update-k386.py` は実DOS用の表示診断 `KDISP.COM` も同梱します。
元のディスクイメージを直接書き換えません。

コアはEmscripten3.1.64、CMake3.31.x、NinjaをPATHに用意してから再ビルドできます。

```sh
bash scripts/build-cirrus-core.sh
bash scripts/prepare-msdos4-cpanel-ci.sh
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --base /webnp2/
```

上流ソースのコミット、適用パッチ、JS/WASM成果物のSHA-256は
`public/core/cirrus-build.json` に記録し、単体テストでも照合します。

```sh
WEBNP2_NO_SANDBOX=1 node scripts/verify-display-probe.mjs \
  http://127.0.0.1:4173/webnp2/ test-results/display-probe
WEBNP2_NO_SANDBOX=1 node scripts/verify-kdesk-highcolor.mjs \
  http://127.0.0.1:4173/webnp2/ test-results/kdesk-highcolor
```

表示診断はゲストCPUによるVRAM書き込み・読み戻し、800×600の実キャンバス、
全RGB565コードの区別、正しい原色と緑6ビット、640×400への復帰、機器なしの
フォールバック、ディスク全バイト不変を検査します。
GUI検査はネイティブアプリ、拡張座標のバスマウス、独立した2つのCPU/CR3/RAM、
バックグラウンド実行と画面復帰を確認します。従来の8つの回帰CIも維持します。
