# KGUI32: KDESKから独立した32bitデスクトップ

KGUI32は、PC-98ゲスト内の32bitプロテクトモードで描画・ウィンドウ管理・入力判定を
実行する独自GUIの基盤です。KDESKを起動せず、ブラウザのHTMLウィンドウも使いません。
従来のMS-DOS/KDESKイメージとは別の、任意選択の実験版イメージとして提供します。

## 起動・操作

CIでイメージ生成後、起動画面の「KGUI32（独立32bit GUI・実験版）」を選択します。
PEGCは640×400・256色、Cirrusの選択肢は800×600・65,536色です。拡張メモリ16 MiBを
指定し、イメージ内のXMSドライバを使用します。32MiB・4枠の選択も追加しました。
詳しくは[実行枠・メモリ拡張](kgui32-expanded.md)。保存済みのディスクは差し替えません。
通常は専用HDDだけから起動し、Editorの保存先はA:\WORKです。
明示的なFD互換起動と、従来FD＋APPSデータHDDの構成も利用できます。
詳しくは[HDD単独起動](hdd-boot.md)と[HDD保存基盤](kgui32-hdd-workspace.md)。

- タイトルバーをドラッグして移動。Tabでフォーカス切り替え。
- WelcomeのCalculator / Clock / DOS Shell / Filesで独立アプリを起動。F2またはCtrl+Kで戻ります。
- **New DOS 1 / 2** で空き枠にKSHを起動。既存ウィンドウは復元。
- DOSウィンドウのRun（Ctrl+L）でコマンドを入力しEnter。実行中のルートは先にEnd。
  例: `COUNT32.EXE 1`、`VIEW32.EXE VIEWDATA.TXT`。Escで入力を取り消し。
- Stop（Ctrl+P）、Resume（Ctrl+R）、End（Ctrl+E）、Again（直前の成功したルートを再起動）。
- 最小化しても処理を継続。下部タスクバーで復元。閉じる操作は所有するセッションを終了。
- DOSウィンドウ右下のグリップでサイズ変更。下部Left/Right/Up/Downで画面をスクロール。
- キーはフォーカス先だけに転送。通常のQ/T/Sもアプリへ届きます。SDK1のTab、Ctrl+L/P/R/Eは予約。FilesのTabはアプリ内移動。
- F10 / Exit to DOSでGUI全体を終了。組み込みウィンドウではEsc/Qも終了。
  DOSで`KDESK`を入力すれば従来GUIを起動可能。

80×25文字の画面を保持し、ウィンドウ内にはその一部を表示します。入力時はカーソル位置を
追従します。表示はASCII・8×16で、PEGCでは一部の行・列をスクロールして操作します。
アプリ枠は既存の2本、GUI専用枠は別に維持します。DOSシェル2本、DOSとPM32、PM32同士を
組み合わせられます。初版GUI SDKの電卓・時計も起動できます。詳細は[kgui32-client-sdk.md](kgui32-client-sdk.md)。

SystemのTest CPU（T）は2つのCOUNT32診断タスクを起動します。既存の実行枠が使用中なら
開始を拒否します。System Stop（S）はこのローダーが所有する対話セッションも終了します。
別の所有者のタスクは表示だけが可能で、入力・停止・終了・置換は拒否します。

## 構成・責務

| モジュール | 実行場所と役割 |
| --- | --- |
| KGUI32.EXE | CPL3/32bit。画面合成、ダメージ領域、フォント、カーソル、座標・入力判定。 |
| KGUILDR.EXE | 専用DOS割り当て。検証付き描画・入力API、XMS・ページテーブル・終了処理。 |
| 共通host-engine.S | 既存K32HOSTと共有する386モード移行、IRQ0による実行中断、CPU復帰処理。 |
| K32HOST/K386 | 既存のPM32/V86アプリ2枠。GUI専用枠とは別のCPU状態・アドレス空間。 |
| WebNP2/NP2kai | PC-98 CPU、メモリ、マウス、PEGC/Cirrusのハードウェアエミュレーション。 |

GUIは専用4 MiBのXMS領域・GDT/IDT/TSS・スタック・ページテーブルを持ちます。
低位メモリは監督者専用、コード/引数ページは読み取り専用、スタックには未割り当て
ガードページを設けます。GUI用feature bit 16とシステムコール64〜72は専用ローダー
だけが受理し、通常のK32RUN/K32HOSTはGUIパッケージを拒否します。

描画は、検証したダメージ矩形を32 KiBの専用中間バッファ経由で既存ネイティブドライバへ
転送します。1ピクセルごとのトラップや、ユーザーへのVRAM/I/O直接公開はありません。
DOS呼び出しとアプリのスケジュールは実モードへ戻った安全な境界で直列に実行します。
イベントキューは32件で移動をまとめ、あふれを計数し、最終ボタン解放を取り込みます。

GUIの正常終了・ページフォールト・無限ループの強制終了では、自分が起動した世代の
アプリと、描画/フォント/パレット/XMS/通常メモリを回収します。既存所有者には
終了要求を送りません。A:ルートの閲覧は読み取り専用、Editorの保存は検証済みWork内に限定します。

これはGUI専用の保護モードクライアントと実モード管理層による最初の基盤です。
常時プロテクトモードで動く新カーネルやWindows互換環境ではありません。

## ビルド・同期

`scripts/prepare-msdos4-cpanel-ci.sh`はMS-DOSの完全なコミットSHAを取得し、通常版と
KDESK/386を生成後、`scripts/update-kgui32.py`で専用イメージを追加生成します。
専用manifestにはネイティブSHA、元KDESKイメージと新イメージのSHA-256、各ファイルの
ハッシュを記録します。通常版のバイナリ・ライセンスを引き継ぎ、AUTOEXECを
`K386.EXE → K32HOST.EXE → KGUILDR.EXE`に変更します。HDD単独起動は専用IO.SYSへ
HDDドライバを組み込み、FD＋データHDD構成ではCONFIGから読み込みます。
同梱THDも専用manifestのSHA-256で管理します。

```
bash scripts/prepare-msdos4-cpanel-ci.sh
npm ci
npm test
npm run build
```

ブラウザE2EはGitHub Actionsで実行します。`Bundled PC-98 DOS disks`がGUI・セッション・
部品・Editor・保存を、専用ワークフローがHDD起動・Files連携・復旧・V86 HDDを検証します。
このチャットではpreviewサーバーを起動しません。

生成画像・manifest・ライセンス出力はPages/CI成果物とし、生成済みイメージをコミット
しません。MS-DOS側をマージしてmain CI成功を確認してからWebNP2側をマージします。
SHA固定により未完了のネイティブ変更が別バージョンへ置き換わることを防ぎます。

## 検証と残る段階

PlaywrightはGUIの実CPUフレーム、CR3/物理メモリ、CPUが取得したアプリRAMの状態、
ページ保護、描画ピクセル、キー/マウス操作、バックグラウンドカウンタを検査します。
正常終了・不正API・実際の#PF・IRQ0で中断する無限ループ・4 MiBでの割り当て拒否を
検証し、最後に従来KDESKの電卓を操作して全FAT12のハッシュ一致を確認します。
`KGPROOF.COM`は生きたDOS親から4回GUIをEXECし、事前に起動した2アプリの世代・
ページテーブル・ヒープが残り、通常/XMS空き量が戻ることも検査します。
セッションE2EではKSH×2、KSH/COUNTER＋COUNT32、VIEW32＋COUNT32の入力分離、
非アクティブ実行、停止・再開・最小化、実ファイル読み取り、起動失敗、#PFと再起動を検証します。
CIはPEGC/Cirrusの専用E2Eを実施し、既存のKDESK/K386テストも維持します。

通常の起動は[HDD単独起動](hdd-boot.md)です。起動メニューにはFD互換起動も残しています。

実装済みの対象はWelcome/Systemと2つのDOS/PM32混在ウィンドウ、GUI SDK4、電卓・時計、
A:ルート／Workを閲覧するFiles、Shift-JISエディタとHDD/FDのWork保存です。
[Files／Editor連携](kgui32-files-editor.md)で選択文書を編集できます。部品・一覧・TXTプレビューは[kgui32-browser.md](kgui32-browser.md)、編集/保存は[kgui32-save.md](kgui32-save.md)を参照。
独立Editor間のクリップボードとUndo/Redoは[GUI SDK3](kgui32-editor.md)、検索・置換、
Shift選択、改行形式、表示拡大とTMP/BAKの明示的復旧は[復旧・Editor操作](kgui32-recovery-editor.md)、
DOSアプリの検証済みHDD読み取りは[V86 HDD](v86-hdd-readonly.md)を参照してください。
ホストのクリップボードは操作しません。
[日本語表示・Shift-JIS読書](kgui32-japanese.md)にも対応します。
Editorのかな／ローマ字IME・変換候補にも対応します。
[DOS端末の日本語・文字属性](kgui32-terminal.md)はPC-98の文字／属性両面を描画します。
文節解析・学習辞書、直接GDCを操作する
外部グラフィックアプリの仮想化、共有ディスク書き込み、実行枠の拡大は後続段階です。
従来KDESKの既存機能も引き続き利用できます。
ネイティブ設計はMS-DOSの`tools/kgui32/README.md`と`SESSIONS.md`を参照してください。
