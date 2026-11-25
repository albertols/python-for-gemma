import { Route, Routes } from "react-router";
import { AppShell } from "./components/AppShell.tsx";
import { AuditScreen } from "./screens/audit/AuditScreen.tsx";
import { BoardScreen } from "./screens/board/BoardScreen.tsx";
import { SchemeCourses, SchemeScreen } from "./screens/scheme/SchemeScreen.tsx";
import { NotFoundScreen } from "./screens/screens.tsx";
import { PackReview } from "./screens/setup/PackReview.tsx";
import { PacksScreen } from "./screens/setup/PacksCard.tsx";
import { SetupScreen } from "./screens/setup/SetupScreen.tsx";
import { TodayScreen } from "./screens/today/TodayScreen.tsx";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<TodayScreen />} />
        <Route path="board" element={<BoardScreen />} />
        <Route path="audit" element={<AuditScreen />} />
        <Route path="scheme" element={<SchemeCourses />} />
        <Route path="scheme/:courseId" element={<SchemeScreen />} />
        <Route path="setup" element={<SetupScreen />} />
        <Route path="setup/courses" element={<PacksScreen />} />
        <Route path="setup/courses/:courseId/pack" element={<PackReview />} />
        <Route path="*" element={<NotFoundScreen />} />
      </Route>
    </Routes>
  );
}
