# GitHub Pagesの公開待機と再試行

masterへのpushで既存のDeploy to GitHub Pagesがbuild → deployの順に実行します。
公開グループは `cancel-in-progress: false` を維持し、実行中の公開を新しいpushで
打ち切りません。ユーザーのディスクを置き換える処理ではありません。

`actions/deploy-pages@v4` は入力timeoutを最大600000ms（10分）に制限します。
1800000msを指定しても30分にはなりません。workflowでは実効値と同じ600000msを
指定し、deployジョブ全体は準備時間を含め15分に制限します。根拠はupstreamの
[src/internal/deployment.js](https://github.com/actions/deploy-pages/blob/v4/src/internal/deployment.js)
にあるMAX_TIMEOUTとMath.minによる入力制限です。action更新時は再確認します。

## 失敗・長時間待機を確認する

1. 対象runのcommit、build結果、deployログの状態と失敗理由を確認します。
2. build成功・deploy失敗なら、GitHub ActionsのRe-run failed jobsで失敗ジョブだけを
   再実行します。CLIでは `gh run rerun RUN_ID --failed` を利用できます。
3. 公開処理がまだ実行中なら完了または制限時間まで待ち、重複の公開を手動起動しません。
   自動の無限再試行は設定しません。再試行でも失敗する場合はPagesの状態とログを調べます。
4. 成功後、対象commitの公開を確認し、公開manifestのnative固定元・dirty=falseと
   FD/HDDのSHA-256を照合します。PR CI、マージ後CI、公開完了を分けて記録します。

このチャットで `npm run preview` を起動しません。ブラウザE2EはGitHub Actionsで実行します。
