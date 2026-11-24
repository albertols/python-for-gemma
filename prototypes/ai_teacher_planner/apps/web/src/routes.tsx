import { Route, Routes } from "react-router";
import { AppShell } from "./components/AppShell.tsx";
import { BoardScreen } from "./screens/board/BoardScreen.tsx";
import {
  AuditScreen,
  NotFoundScreen,
  TodayScreen,
} from "./screens/screens.tsx";
import { SetupScreen } from "./screens/setup/SetupScreen.tsx";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<TodayScreen />} />
        <Route path="board" element={<BoardScreen />} />
        <Route path="audit" element={<AuditScreen />} />
        <Route path="setup" element={<SetupScreen />} />
        <Route path="*" element={<NotFoundScreen />} />
      </Route>
    </Routes>
  );
}
