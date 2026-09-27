// HDDスロット行(fd-slotsの3行目)の表示切り替え。
//
// 親からの指示書のとおり、初期値は非表示にし、「…」メニューのトグル(aria-pressed)で
// ON/OFFできるようにする。状態はlocalStorageへ保存する(player.ts側、webnp2.<名前>の
// 既存命名規約に合わせる)。
//
// ただしHDDが既にセット済み(起動前のペンディング・URLパラメータ経由を含む)なら、
// トグルがOFFでも隠さない(空のスロットを見せない意図でトグルを導入したのに、既に
// 使っているスロットまで隠すと利用者が「消えた」と誤解するため)。
//
// 移植元: WebX68k(同作者の兄弟プロジェクト) src/drive-visibility.ts の
// shouldShowDriveRow()。この判定を「行のhidden属性を直接いじるコード」から切り離した
// 純関数にすることで、DOM無しでテストできるようにする(WebX68kと同じ設計)。

/**
 * HDDスロット行を表示するかどうか。
 * @param userPref  トグル(localStorage)で利用者が選んだ表示希望。
 * @param hasContent HDDが既にセットされているか(マウント済み/起動前のペンディング・
 *   URLパラメータ経由を含む)。
 */
export function shouldShowHddSlot(userPref: boolean, hasContent: boolean): boolean {
  return userPref || hasContent;
}
