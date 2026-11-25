import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { RemindersList } from "./RemindersList.tsx";

test("an exam is listed with its code, title, date and days left", () => {
  const html = renderToStaticMarkup(
    createElement(RemindersList, {
      reminders: [
        {
          kind: "exam",
          date: "2027-06-01",
          daysLeft: 7,
          label: "WBS14 01 IAL Business Unit 4: Global Business",
          groupIds: ["13 1"],
        },
      ],
    }),
  );
  expect(html).toContain("WBS14 01 IAL Business Unit 4: Global Business");
  expect(html).toContain("in 7 days");
  expect(html).toContain("Tuesday 1 June 2027");
});
test("the empty message mentions exams", () => {
  const html = renderToStaticMarkup(
    createElement(RemindersList, { reminders: [] }),
  );
  expect(html).toContain("official exams");
});
