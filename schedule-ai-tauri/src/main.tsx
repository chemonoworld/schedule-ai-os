import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import './i18n';
import { useSettingsStore } from "./stores/settingsStore";

function AppWithI18n() {
  const { isInitialized, initLanguage } = useSettingsStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initLanguage().then(() => setReady(true));
  }, [initLanguage]);

  if (!ready || !isInitialized) {
    return null; // 언어 초기화 전 빈 화면
  }

  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppWithI18n />
  </React.StrictMode>,
);
