# KGUI32: GUI SDK第2版とFiles

Welcomeの **Files** をクリックすると、独立した32bitウィンドウでA:ルートの一覧を開きます。
Workへの切り替えと選択文書の編集は[Files／Editor連携](kgui32-files-editor.md)を参照してください。
現在の日本語TXTプレビューは[日本語表示・Shift-JIS読書](kgui32-japanese.md)も参照してください。
以下はGUI SDK2時点の操作・制限の記録です。
空きアプリ枠は2本の共通枠から確保し、他方でClock・Calculator・DOSを継続できます。
Run（Ctrl+L）から `KGFILES.EXE` を入力しても起動できます。拡張メモリ16 MiB、
アプリ各4 MiB、GUI専用4 MiBの構成です。保存済みのユーザーディスクは変更しません。

- Filterに名前の一部を入力。英字の大小を区別せず8.3名を絞り込みます。
- TabでFilter→一覧→Open/Back→Refresh/List→About→Closeへ移動。行をクリックして選択し、
  EnterまたはOpenでTXTを同じキャンバスへ表示します。F2/Ctrl+KはWelcome、タスクバーは窓切替。
- 一覧・プレビューではカーソル、Home/End、Page Up/Downを使用できます。
  PC-98のCLR/HELP、ROLLキーに相当します。スクロールバーは矢印・ページ・つまみドラッグに対応し、
  キャンバス外でも解放できます。フォーカス変更やリサイズでドラッグを取り消します。
- Esc/Backで一覧へ戻り、絞り込み・選択を保持します。TXTは128 KiBまで、40桁で折り返し、
  ASCIIを表示します。タブは1空白、非ASCIIは `?`。空ファイルも開けます。
- バイナリ、TXT以外、サブディレクトリ、上限超過はダイアログで通知します。
  保存・削除・名前変更・実行・サブディレクトリへの移動は今回の範囲に含みません。
- 最小化・移動・リサイズ・Stop/Resume・End/Againは既存どおり。Ctrl+L/P/R/Eは予約です。
  CloseはFilesだけを終了し、F10はGUIを終了してDOSへ戻ります。

SDK2の部品はPC-98ゲストの保護されたアプリ内で動きます。HTMLの窓は使用しません。
入力欄、一覧、スクロールバー、ボタン、ダイアログ、アプリ内フォーカスを共通化しました。
既存のSDK1電卓・時計とwire ABI 1は維持し、ポインター移動とローカルTabは明示的に購読します。
イベント数・描画コマンド数・座標・ユーザーバッファは有界で、捕捉はタスク世代/窓トークンに属します。

一覧はK32HOSTの新しい読み取り専用サービス（feature bit 64、syscall 14〜16）を使用します。
名前・サイズ・属性・DOS日時と64バイトのバージョン付きレコードを返し、パス指定は受けません。
検索カーソル/DTAはタスク別、共有DOS DTAは各呼び出しの前後で復元します。GUI callbackやIRQ内で
DOSを呼びません。詳細はnativeの[SDK2仕様](https://github.com/kumakumapon/MS-DOS/blob/main/tools/kgui32/BROWSER-SDK.md)。

## ビルド・検証

`scripts/prepare-msdos4-cpanel-ci.sh` は検証対象のnativeコミットを固定し、通常DOS4、
KDESK/386、KGUI32を同じソースから生成します。KGFILES、境界検査用KGDIRBAD/KGDIRNOと、
長いTXT・空TXT・バイナリTXTを専用GUIイメージへ追加します。画像・manifest・ライセンス出力は
生成物としてCI/Pagesへ送り、ソースPRには含めません。

```sh
bash scripts/prepare-msdos4-cpanel-ci.sh
npm ci
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
WEBNP2_NO_SANDBOX=1 node scripts/verify-kgui32-browser.mjs http://127.0.0.1:4173/ test-results/files-pegc pegc
WEBNP2_NO_SANDBOX=1 node scripts/verify-kgui32-browser.mjs http://127.0.0.1:4173/ test-results/files-cirrus cirrus
```

Playwrightは本物のゲスト部品を操作し、CPL3/CR3/物理メモリ、CPUが採取したアプリRAM、
全ディレクトリの名前・サイズ・属性・DOS日時、64 KiB超TXT全内容のハッシュを実FATデータと照合します。
Tab/キー・マウス捕捉・一覧/プレビュー/復帰、背景Clock、停止/再開、二つのFiles、
不正ポインター・古いカーソル・featureなし、End/#PF/再起動と回収、全FAT12の不変性を検査します。
既存GUI、DOS/PM32混在、日本語等の回帰テストと両リポジトリCIも継続します。

IME、日本語描画、サブディレクトリ、編集・保存、画像、実行枠/メモリの拡張は後続です。
取り込み順はMS-DOS→main CI成功確認→WebNP2。PRは自動マージしません。
