# DOS 4.0の日本語入力・編集

[MS-DOS Issue #5](https://github.com/kumakumapon/MS-DOS/issues/5)で両リポジトリの作業を追跡します。
JIS/US配列を選べるようにし、ホストOSのIMEで確定した日本語をDOSへ入力します。
同梱FDのEDIT98とDOSのCONでShift_JIS本文を編集・表示・保存します。

IME変換中のキーをゲストへ漏らさず、未対応文字を通知し、保存した実ファイルを読み戻して検証します。
