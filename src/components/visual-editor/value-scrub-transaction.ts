import { createContext, useContext } from "react";

/**
 * 数値をドラッグで動かしている間の変更を、Undo 一件にまとめるための入口。
 * `ScrubNumberInput` がこの Context を見つけた場合、ドラッグ開始から終了まで
 * を一つの操作として扱い、途中の値を履歴へ積まない。
 */
export type ValueScrubTransaction = {
  /** ドラッグで値が動き始めた。 */
  begin: () => void;
  /** ポインタを離して確定した。変化があれば履歴を一件追加する。 */
  end: () => void;
  /** Escape などで取り消した。開始前の状態へ戻す。 */
  cancel: () => void;
};

export const ValueScrubContext = createContext<ValueScrubTransaction | null>(null);

export function useValueScrubTransaction(): ValueScrubTransaction | null {
  return useContext(ValueScrubContext);
}
