import { createContext } from "react";

/** Keep panel form state mounted while allowing costly previews to stop. */
export const EditorPanelVisibilityContext = createContext(true);
