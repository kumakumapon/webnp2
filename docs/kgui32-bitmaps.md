# 描画SDK・画像アプリ

KGUI32のWelcomeからImagesを開くと、同梱のSAMPLE.BMPを表示します。
FilesでA:ルートのBMPを選び、Open appから開くこともできます。
既存の16MiB・2枠と32MiB・4枠、PEGC／Cirrus、HDD／完全版FDで利用できます。

画像は最大256×192ピクセルの無圧縮24ビットBMPです。ファイル名を入力してLoad、
Invertで色反転、Flip Hで左右反転、Undoで直前の操作の取り消しができます。
PaintまたはPでブラシを有効にし、ドラッグすると3ピクセル幅の線を描きます。
Rで読み込み時の画像に戻り、矢印キーで表示位置を移動します。Close／Qで終了します。
編集内容はメモリ上に保持し、Save／Ctrl+SでWorkへBMP保存できます。
同名ファイルの置換は確認し、他アプリによる変更は競合として停止します。
Ctrl+WでLoadのRoot／Workを切り替え、Ctrl+RでTMP/BAKを検査・明示復旧できます。
対応しない形式や読み込みエラーでは、現在の画像とUndoを保持します。

SDKは各アプリに1面のRGB565画像を割り当て、最大3040バイトずつ転送します。
置き換え途中は前の完成画像を表示し、全データが揃ってから切り替えます。
描画は元画像の切り出し、アプリの表示領域、ウィンドウの重なりでクリップします。
ハンドル・所有者・世代を検証し、終了・異常終了・枠の再利用で回収します。
既存の描画ABIと4MiBのアプリ専用領域を維持します。
詳細は[ネイティブSDK仕様](https://github.com/kumakumapon/MS-DOS/blob/main/tools/kgui32/BITMAP-SDK.md)。

CIは配布媒体を実際に起動し、CPU・ページテーブルに照合した私有画像バッファと、
PEGC／Cirrusの実画面ピクセルを照合します。編集・読み込み失敗時の保持、他アプリへの
不正アクセス拒否、負の描画座標、4本同時起動、画像転送後の例外・再利用・終了時の
メモリとベクタ復旧、媒体全体の不変性を確認します。
ブラウザE2EとプレビューサーバーはGitHub Actions内で実行します。


## Work BMP saving and recovery

Images now supports explicit BMP24 saving to Work, using the existing bounded
DOS transaction. Ctrl+S saves the entered BMP name, with confirmation for an
existing destination. A cached revision prevents overwriting a peer's changes.
Changing the filename provides Save As. Undo is retained after saving.
Ctrl+W selects Root/Work for Load; Files opens BMPs from either location.
Ordinary Load/Close offer Save/Discard/Cancel for unsaved pixels.

Ctrl+R inspects BMP/TMP/BAK hashes for the entered name. Inspect TMP/BAK validates
complete BMP data against that revision. Explicit Restore moves the candidate
to an unused BMP destination, retaining the original, other candidate and live
pixels/Undo. Full disk, protected targets, malformed BMPs and stale revisions
retain the original. No candidate is silently deleted. DOS renames are not
power-loss atomic; export and inspect candidates after an interrupted save.

Native [IMAGE-SAVE.md](https://github.com/kumakumapon/MS-DOS/blob/main/tools/kgui32/IMAGE-SAVE.md)
documents the BMP flag, 256x192 bounds and 147510-byte canonical output.
The Actions save/recovery suites compare actual exported FAT bytes, maximum
BMP data, conflicts, explicit recovery, rejection and cold boot on both video
backends. Local preview is never required.
