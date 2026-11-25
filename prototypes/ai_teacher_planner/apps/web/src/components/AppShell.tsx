import { useState } from "react";
import { NavLink, Outlet } from "react-router";
import { PlannerNotRunning } from "../api/client.ts";
import { useConfig } from "../api/queries.ts";
import { cn } from "../lib/utils.ts";
import { currentTheme, setTheme } from "../theme/theme.ts";
import { ActivityDrawer } from "./ActivityDrawer.tsx";
import { JobChip } from "./JobChip.tsx";
import { Legend } from "./Legend.tsx";
import { Button } from "./ui/button.tsx";
import { ErrorState } from "./ui/states.tsx";

const NAV = [
  { to: "/", label: "Today", end: true },
  { to: "/board", label: "Board", end: false },
  { to: "/audit", label: "Slot audit", end: false },
  { to: "/setup", label: "Setup", end: false },
];

function ThemeToggle() {
  const [theme, setLocal] = useState(currentTheme);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <Button
      type="button"
      onClick={() => {
        setTheme(next);
        setLocal(next);
      }}
    >
      Switch to {next} theme
    </Button>
  );
}

/** The frame of every screen: skip link, one nav, one main. */
export function AppShell() {
  const config = useConfig();
  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
      >
        Skip to the page
      </a>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
        <p className="text-lg font-semibold">AI Teacher Planner</p>
        <nav aria-label="Main" className="flex flex-wrap gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-3 py-2 text-sm font-medium",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <JobChip />
          <ActivityDrawer />
          <Legend />
          <ThemeToggle />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-6 py-8">
        {config.error instanceof PlannerNotRunning ? (
          <ErrorState
            title="The planner is not running"
            message="The page cannot reach the planner on this computer."
          >
            <p className="mt-2">
              Start it in a terminal with{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">pnpm start</code>
              , then reload this page.
            </p>
          </ErrorState>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
