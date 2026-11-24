import { Route, Routes } from "react-router";
import { AppShell } from "./components/AppShell.tsx";
import {
  AuditScreen,
  BoardScreen,
  NotFoundScreen,
  SetupScreen,
  TodayScreen,
} from "./screens/screens.tsx";

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
