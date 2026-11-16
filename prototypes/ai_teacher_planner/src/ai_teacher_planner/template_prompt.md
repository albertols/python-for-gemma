# 🧭 AI Teacher Planner — Your Master Prompt (fill-in template)

Hello Gemma! 👋 This file does **two jobs at once**:

1. 🎓 **It teaches you prompt engineering.** Every part covers one skill
   (giving the AI a role, context, constraints, examples, an output format…).
   You learn each skill by using it on a real problem: *your* planning week.
2. 🏗️ **When it's finished, it IS the prompt.** You paste the completed file
   into Claude Code, and it produces the full "360" plan for the AI Teacher
   Planner: spec → decisions (ADRs) → build plan → tests.

So every answer you write here does two things: you learn a technique, and
you give the AI a piece of what it needs. The better your answers, the
better the app. 🐦🐦🪨

```mermaid
flowchart LR
    A["✍️ You fill in<br/>this template"]:::concept --> B["🧠 You learn<br/>prompt engineering"]:::win
    A --> C["📄 A finished<br/>master prompt"]:::concept
    C --> D["🤖 Claude Code<br/>reads it"]:::ai
    D --> E["📐 Spec + ADRs<br/>+ build plan"]:::win
    E --> F["🧪 Tests first,<br/>then the app"]:::win
    C -.->|"vague answers"| G["⚠️ Generic plan<br/>nobody uses"]:::warn

    classDef concept fill:#4F86C6,color:#fff,stroke:#2B4C7E
    classDef win fill:#59A96A,color:#fff,stroke:#2E5E3A
    classDef warn fill:#F4A259,color:#333,stroke:#B87333
    classDef ai fill:#8E6BAF,color:#fff,stroke:#5D3F7A
```

---

## 📌 How to use this file

- Write your answers under each `> ✍️ Your answer:` line. Bullet points are
  fine. "I don't know yet, ask the HoD" is a perfectly good answer.
- 📝 **Draft** boxes hold what you told Alberto in conversation. Read each
  one and **correct anything wrong**. The AI will treat it as true.
- 🧠 **Prompt skill** boxes explain the technique each part teaches. Read
  them first.
- `TODO` items are tasks, not questions (e.g. "draw a screenshot", "write an
  ADR").
- You don't have to go in order, **but Part 12 (the assembled prompt) only
  works once Parts 1–11 are done.**
- 🔒 **Never paste** real student names, grades, emails, passwords or school
  login tokens into this file. Use `student1`, `Group A`, etc. This file gets
  committed to GitHub, and it gets sent to an AI.

### ✅ Progress tracker

- [ ] Part 1 — Role
- [ ] Part 2 — Context: you and your school
- [ ] Part 3 — The problem, in your words
- [ ] Part 4 — Research: what already exists
- [ ] Part 5 — Inputs: what the planner reads
- [ ] Part 6 — Features: what the planner does
- [ ] Part 7 — Users and roles
- [ ] Part 8 — Look and feel
- [ ] Part 9 — Constraints and non-negotiables
- [ ] Part 10 — General specs: user stories and acceptance tests
- [ ] Part 11 — Engineering practices: ADR, TDD, BDD
- [ ] Part 12 — The assembled master prompt
- [ ] Part 13 — Reflection

---

## 🧠 Before you start: what a good prompt is made of

A prompt is a **brief to a very fast, very literal new colleague** who has
never been to your school. Think about how you'd brief a cover teacher. You
wouldn't just say "teach Year 12". You'd tell them who the class is, where
they're up to, what to do, what *not* to do, and what to leave on your desk
afterwards.

| Ingredient | Cover-teacher version | Where it lives in this file |
|---|---|---|
| **Role** | "You're covering for a Business teacher" | Part 1 |
| **Context** | "Y12 IAL, they've just finished Unit 1 marketing" | Parts 2–5 |
| **Task** | "Run the case-study practice on p.14" | Parts 6, 12 |
| **Constraints** | "No phones; don't give out the mark scheme" | Parts 7, 9 |
| **Examples** | "Here's what a good answer looked like last year" | Parts 10, 11 |
| **Output format** | "Leave the scripts in a pile, sorted by group" | Part 12 |
| **Success criteria** | "Everyone has attempted Q1 and Q2" | Parts 3, 10 |

> 🧠 **Prompt skill: garbage in, generic out.** An AI fills every gap you
> leave with the *most average* guess. "Make a lesson planner" gets you the
> average planner, which already exists and which you already find tedious.
> Your specific details (three IAL groups, a two-week timetable, leaked past
> papers) are what make the result useful to *you*.

---

## Part 1 — 🎭 Role: who should the AI be?

> 🧠 **Prompt skill: role prompting.** Opening with "You are a…" makes the AI
> use the vocabulary, priorities and standards of that expert. It works
> best when the role is *specific* and you combine several kinds of
> expertise the job actually needs.

**Weak:** `You are a helpful assistant.`
**Better:** `You are a software architect.`
**Strong:** `You are a senior product architect who has built planning tools
for international schools, and you understand the Pearson Edexcel IAL, IGCSE
and IB Diploma curricula, UK-style two-week timetables, and safeguarding
rules for student data.`

**1.1** Which kinds of expertise does the AI need for *this* job? Tick or add.

- [x] Software architect (TypeScript/React web apps)
- [x] Experienced international-school teacher / Head of Department
- [x] Exam-board specialist (Edexcel IAL / IGCSE / IB)
- [x] UX designer for busy teachers
- [x] Data-protection / safeguarding advisor
- [ ] Other:

**1.2** `TODO:` Write your own role sentence (1–3 sentences), combining what
you ticked.

> ✍️ Your answer: You are a senior product architect who has built a planning tool
for an international school teacher. You have a deep understanding of the Pearson Edexcel Business ial, Pearson Edexcel Business igcse (9-1)
and ibdp Business Management curricula. You also understand the workings and complexities of UK-style two-week school timetables, and safeguarding
rules for student data, including names, marks and any personal information (SEND, Mental Health status, exam arrangements). This platform should allow me to encapsulate my daily routines of planning lessons, creating resources (ai content creator prototype), tracking students progress and ensuring I am able to cover all aspects of the curriculum set out by the subject syllabus and assessment objectives. 

**1.3** 🤔 Think about it: what might go wrong if the AI were *only* a
software architect, with no teacher in its role?

> ✍️ Your answer: You would end up creating a generic planning tool that would simplify the day-to-day reality of a teacher, students and a school. It would simply be a calendar style tool that follows a basic routine and assumes that no flexibility would be needed. You would also end up providing generic resources (ai content creator prototype) and lesson ideas that are not based on a specific curriculum or syllabus. For instance, creating some generic worksheets to use with Business students, without considering the specific assessment objectives and required content, and how that differs between different exam boards. In addition, you would not consider the importance of saving a teacher time of completing repetitive tasks, such as inputting data in a marksheet by hand and using this to inform of student progress etc. 

---

## Part 2 — 🏫 Context: you and your school

> 🧠 **Prompt skill: context is the whole game.** The AI knows nothing about
> your school. Every fact you give here is a guess it no longer has to make.
> Concrete numbers beat adjectives: "3 groups × 5 lessons per fortnight"
> beats "a few groups".

**2.1** 📝 **Draft: check and correct.**

> - I teach in an international/British school delivering several Business curricula: IB
>   Diploma (ibdp), Pearson Edexcel IGCSE (igcse) and Pearson Edexcel IAL (ial).
> - This year I am only teaching Business. But in the future I will need the planner to help me plan a multitude of subjects and levels. So please bare this in mind in the design.
> - I often teach **three parallel groups at the same level**
>   (e.g. three ial Y13 Business groups for unit 4) and deliver the same lessons to all
>   three, with minor changes depending on timings of timetables and ability level of student groups.
> - The school runs a **two-week timetable** (Week 1 / Week 2), so the
>   groups don't always get the same number of lessons when we have holidays, or school events happening (some planned some unforeseen).
> - Consider that when there is an extended holiday, the week continue after - for example if we finish for Winter holidays on Week 1, the week we return in January will be week 2.
> - ![timetable.png](../../../resources/timetable.png) "400" means I supervise a study hall. Blank cells mean I have preparation time. Grey coloured cells mean I have break/lunch, or Form that requires no planning.
> - Over two weeks I teach one igcse Edexcel Business group ("11D") for five 55minute periods, one ibdp Business Management group in Y12 that is split into Standard Level ("IB S") and Higher Level ("IB H") leveled groups where "IB S lessons" is made up of students from both "IB S" and "IB H" and I have six 55minute periods, and the "IB H" group is only "IB H" students and I have four 55minute periods. I need to be able to cover the Higher Level only content that could be from Y12 or Y13 ibdp content with the IB H group when I have them alone, which can be difficult, especially at the beginning of the course as we have not covered some of the basics in IB S yet, such as Unit 1. 
> - I also teach three ial Edexcel Y13 Business groups ("13 1", "13 3", and "13 5") for six 55minute periods each. 
> - School systems: MS Teams (Classes for igcse and ial for communication, assignments, adding marks etc, and also as a general communication tool for staff in school as Teams) + OneDrive/SharePoint (main source of where my teaching and planning resources live), SIMS Next Gen (previous legacy SIMS was in a Virtual Machine) features seating plans, markbooks, behavior dashboards, attendance tracking, and pupil profiles.,
>   Toddle (for ibdp only, used for class communication, assignments and submission of Internal Assessments and Extended Essays), Examwizard (Edexcel ial and igcse past exam papers, mark schemes, examiner reports, and option to build papers by selecting past paper questions), Results Plus (Edexcel/Pearson. Used to access students' official examination scripts for ial and igcse. Also for accessing examiner respots and mark schemes), Cognita Connect (to email parents),
>   SchoolCloud (parents' evenings), Question Bank (ibdp past exam papers, mark schemes).

> ✍️ Corrections / additions:

**2.2** `TODO:` Fill in your teaching load (anonymised; groups only, no
student names).

![timetable.png](../../../resources/timetable.png)

School day Timings:
Period 1: 08:45-09:40
Period 2: 09:40-10:35
Break 1 (Form): 10:35-10:55
Break 2: 10:55-11:15
Period 3: 11:15-12:10
Period 4: 12:10-13:05
Lunch 1: 13:05-13:50
Lunch 2: 13:50-14:35
Period 5: 14:35-15:30
Period 6: 15:30-16:25

**2.3** Which dates break the rhythm in a typical year? (half terms, INSET
days, mock weeks, trips, school events, exam leave…)

> ✍️ Your answer: [Hastings School - Calendar 26-27 (Teaching) updated Oct26.pdf](../../../resources/Hastings%20School%20-%20Calendar%2026-27%20%28Teaching%29%20updated%20Oct26.pdf) 
> [2026-27 Secondary Calendar ALL STAFF.xlsx](../../../resources/2026-27%20Secondary%20Calendar%20ALL%20STAFF.xlsx) ![calendar_tabs_1.png](../../../resources/calendar_tabs_1.png) ![calendar_tabs_2.png](../../../resources/calendar_tabs_2.png)
> Yes, consider "Half Term", "School Holidays", "Official Holidays", "School closed to pupils for staff training". Important to consider the dates correlated with Week 1 and Week 2 in the [2026-27 Secondary Calendar ALL STAFF.xlsx](../../../resources/2026-27%20Secondary%20Calendar%20ALL%20STAFF.xlsx). For instance our midterm holidays start at the end of a "Week 2" (12th February) and when we return (22nd Feb) we will commence on a "Week 1" timetable. This ensures we are not always missing the same weeks on extended holidays. This is important and must be considered in the AI Planner scheduling.
mock weeks, trips, school events, exam study leave - all of which will be updated as the school year continues in the [2026-27 Secondary Calendar ALL STAFF.xlsx](../../../resources/2026-27%20Secondary%20Calendar%20ALL%20STAFF.xlsx) document. Consider that the ibdp ("IBDP calendars") can differ. 
> Also consider the "Report Deadlines" and "Parents Evenings".
> Additionally if I am absent from school the order of content delivery may have to be updated or resources edited (by cai ontent creator prototype) so that they can be completed by students independently. 

**2.4** Does your department share a Scheme of Work, or do you each write
your own? Who has the final say?

> ✍️ Your answer: 
> igcse Business: I need to cover Y11 igcse content as I only have class with 11D and no Y10. We will cover Unit 3, 2 and 5. We are three teachers in the department and the Head of Department decides on order of content and Units, and when assessments take place. We need to have three different versions of the assessment, one for each class, and then we try to change the order or certain questions for each assessment so that there are two final versions for each Y11 group to avoid copying.
> [IGCSE spec.pdf](../../../resources/igcse/igcse%20Textbook%20and%20Specification/IGCSE%20spec.pdf)
> [Pearson Edexcel International GCSE (9-1) Business Student Book.pdf](../../../resources/igcse/igcse%20Textbook%20and%20Specification/Pearson%20Edexcel%20International%20GCSE%20%289-1%29%20Business%20Student%20Book.pdf)
> [IGCSE Y11 Planning.xlsx](../../../resources/igcse/Planning/IGCSE%20Y11%20Planning.xlsx)
> [Y11 IGCSE Assessment Schedule.docx](../../../resources/igcse/Planning/Y11%20IGCSE%20Assessment%20Schedule.docx)
> ial Business: I am focusing only on Y13 content and specifically Unit 4 this year (but in the future will need planning for all four units). I am the sole teacher of this Unit and responsible for planning the creation and delivery of content and internal assessments during lessons. I also need to create the exam practice materials (ai content creator prototype), and a mock exam to be sat in January/February according to the school calendar (ai examiner prototype).
[IAL BUSINESS SPECIFICATION.pdf](../../../resources/ial/ial%20Specification%20%26%20Textbook/IAL%20BUSINESS%20SPECIFICATION.pdf) 
[⁮IALBusiness Student Book 2 Edexcel.pdf](../../../resources/ial/ial%20Specification%20%26%20Textbook/%E2%81%AEIALBusiness%20Student%20Book%202%20Edexcel.pdf)
[Y13 Unit 4 Planning.xlsx](../../../resources/ial/Planning/Y13%20Unit%204%20Planning.xlsx)
> ibdp Business Management: This group is separated into Standard and Higher Level classes, where during Standard Level classes both Standard and Higher level students attend, and during HL classes only Higher level students attend. Due to this it is my responsibility to decide how to separate and plan the IB Business Management content so that I am covering all the Standard Level content with everyone. In Y12 we cover Unit 1, 4 and 3. In Y13 we cover a part of Unit 3, unit 2 and 5. For example I have covered topic 2.5 during tody's lesson with "IB H".
> [Business Management Guide.pdf](../../../resources/ibdp/ibdp%20Textbook%20%26%20Guide/Business%20Management%20Guide.pdf)
> [Business Management Syllabus.pdf](../../../resources/ibdp/ibdp%20Textbook%20%26%20Guide/Business%20Management%20Syllabus.pdf)
> [Business Management - Surridge, Gillespie and Mills - Hodder 2022.pdf](../../../resources/ibdp/ibdp%20Textbook%20%26%20Guide/Business%20Management%20-%20Surridge%2C%20Gillespie%20and%20Mills%20-%20Hodder%202022.pdf)
> [IBDP Hastings_Course Outline_Business Management_SL&HL 2026-27.docx](../../../resources/ibdp/Planning/IBDP%20Hastings_Course%20Outline_Business%20Management_SL%26HL%202026-27.docx)

**2.5** 🤔 Which facts in this part would a teacher at a *different* school
get wrong about yours? (Those are the ones that matter most in a prompt.)

> ✍️ Your answer: They would struggle with the fact that we reorder the content for igcse and ibdp instead of following the order in the specification/syllabus/guide.
> igcse Business content order: In Y10 we cover Unit 1 followed by Unit 4. IN Y11 we cover Unit 3, then Unit 2 and finally Unit 5.
> ibdp Business content order: In Y12 we cover Unit 1, followed by Unit 4, then part of Unit 3. In Y13 we finish Unit 3, work on the Internal Assessment and then do Unit 5.
> ial Business content: All units are completed in linear order.

---

## Part 3 — 😩 The problem, in your words

> 🧠 **Prompt skill: state the problem, not the solution.** If you ask for
> "a calendar app", you get a calendar app. If you describe the pain ("I
> lose hours making sure Group C doesn't fall behind after half term"), the
> AI can suggest solutions you hadn't thought of. Problems also give you
> **success criteria**: you'll know it worked when the pain is gone.

**3.1** 📝 **Draft: check and correct.** Your planning week as you
described it:

> 1. I open the **syllabus/specification/guide/syllabus** and my **Scheme of Work / long-term plan**
>    and decide how many lessons each topic needs.
> 2. I open my **timetable** and break the topics into lessons.
> 3. I repeat the lessons across my three parallel groups for ial, but because of
>    the two-week timetable and holidays, **keeping all three groups on
>    the same content is tedious**.
> 4. I spend a lot of time figuring out what to teach in with the Higher Level only group ("IB H") as there is some content that I cannot cover until the basics are covered in the Standard Level ("IB S") class. Now I have covered the HL only topics in Unit 5, so need to figure out which topics I can combine. 
> 5. I need **class activities** and **independent tasks students can't
>    just hand to AI**, so I end up doing most **exam practice in class**
>    to keep it authentic. I like to have some exam practice/planning tasks that include the students having to do paragraphs with the PBLT (Point, Because, Leads to, Therefore) format.
> 6. Keeping lessons **current** (real-world events, real businesses) means
>    I keep reworking resources. What I want is **updates added to my
>    existing resources**, like my chapter PowerPoints, not whole new
>    lessons. This should be part of the ai content creator prototype. Especially for ial Businesses in Unit 4 content, as one prerequisite is that the students include some real world examples in their answers to support their points and judgements.
> 7. **Past papers are compromised**: students can find the answers, so I
>    rewrite questions and change details in case studies myself. This is mostly when it comes to timed assessments as students can study from mark schemes or see the questions prior. This happens especially with ial and igcse.
> 8. If there is a school holiday, for example if we are off on a Monday and Tuesday, I need to consider this in my planning to make sure I am still getting all the content covered.
> This is especially important when the holiday means I miss a class with one of my three parallel classes in ial, or if I miss my igcse "11D" class and end up behind in comparison with my other two collegues as they do not have their classes on those days so do not miss their lessons.

> ✍️ Corrections / additions:

**3.2** `TODO:` Rank the pains 1 (worst) to 5, and estimate minutes lost per
week. These numbers become the app's **success metrics**.

| Pain | Context | Rank | Minutes / week today | "Solved" would look like…                                                                                                                                                                                                         |
|---|---|---|---|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Syllabus → Scheme of Work → Timetable | Opening the syllabus and Scheme of Work, and the subject syllabus/guide/specification to decide how many lessons each topic needs, then breaking topics into individual lessons using my timetable. | 1 | 120 | If this could be automised in my planner tool based on my school calendar and timetable.                                                                                                                                          |
| Keeping three parallel IAL groups in sync | Repeating lessons across three groups with a two-week timetable and school holidays. Keeping all groups on the same content is tedious. | 3 | 60 | Again if this was automised and optimised so that considering my timetable schedule and the school calendar, especially considering school holidays in the school calendar.                                                       |
| Planning IB Higher Level (IB H) lessons | Finding suitable content for the HL only group (IB H) when some topics depend on the IB Standard Level (IB S) foundations. Unit 5 HL-only content has now been covered, so I need to identify topics that can be combined or covered. | 2 | 90 | Create a list for of topic/chapter combinations in order based on the subject guide/specification to choose/ suggest topics to combine or complement. This should be added to my planner.                                         |
| AI-resistant activities and independent tasks | Creating meaningful class activities and independent tasks students cannot simply hand to AI. I do most exam practice in class to keep it authentic. I also want exam planning and paragraph-writing activities using PBLT (Point, Because, Leads to, Therefore). | 8 | 120 | A content creater that can take official exam questions with case studies and and edit them so they are not recognisable to students.                                                                                             |
| Keeping existing teaching resources current | Updating existing chapter PowerPoints with real-world events and business examples rather than creating entirely new lessons. Particularly important for IAL Business Unit 4, where students need real-world examples to support their answers and judgements. | 6 | 40 | Suggestions of current events that are relevant and connect with content. This can be added to the planner as updates!                                                                                                            |
| Compromised past papers and exam practice | Students can find past-paper answers, mark schemes and questions in advance. I spend time rewriting questions and changing case-study details, particularly for timed IAL and IGCSE assessments. | 7 | 40 | Same as point 4 solution.                                                                                                                                                                                                         |
| Adjusting planning around school holidays | Accounting for holidays that interrupt the teaching sequence, such as Monday and Tuesday closures, to ensure all syllabus content is covered. | 5 | 45 | Consider the school calendar when planning.                                                                                                                                                                                       |
| Keeping IAL and IGCSE classes aligned after missed lessons | When a holiday means I miss one of my three IAL parallel groups, or my IGCSE 11D class, other colleagues may continue teaching their classes and get ahead. I need to adjust my planning to catch up without losing syllabus coverage. | 4 | 70 | Again considering the school calendar. But also having the planner capable of updating and being flexible if there is an unexpected absence or if a certain topic takes longer with one class than another in my parallel groups. |

**3.3** Walk me through the **last time** a group fell out of sync. What
happened, how did you notice, and how did you fix it?

> ✍️ Your answer: I was absent for 3 days (Tuesday to Thursday). This meant that I missed 3/3 lessons for two of the ial groups, meaning they were behind on content. 
> I ended up having to replan those lessons by leaving cover, which involved the students doing extra exam practice on the previous content that we covered together, and notetaking on the original chapter that was meant to be covered together.
> Once we were back together in class the following week, these two groups missed out on some support with the content and also missed out on doing some exam practice and preparation tasks that was completed with the other ial group that I didn't miss classes with.
> Therefore the two ial classes that I missed due to being absent will be at a disadvantage.

**3.4** 🚫 **Anti-goals**: what would make this app a failure *even if it
technically works*? (e.g. "If I have to spend longer checking the AI's
work than doing it myself.")

> ✍️ Your answer: If I have to take too much time actually double-checking the plan created in relation to the syllabus. Also, the creation of resources (more in relation to the ai content creator prototype) that are not adjusted to the appropriate level or are too general. Lastly if the suggestions given for lessons are too repetitive.

---

## Part 4 — 🔎 Research: what already exists

> 🧠 **Prompt skill: give the AI reference points, and check its facts.**
> "Like Trello but for lesson plans" carries a lot of meaning in a few
> words. **But** AIs sometimes describe products confidently and wrongly.
> For example, Edmodo **shut down in 2022**, yet an AI might still describe
> it as a live product. Treat anything the AI tells you about a real
> product as a lead to check, not a fact.

**4.1** `TODO:` Fill in what *you* know first, before asking any AI. Your
first-hand experience is worth more than its summary.

Chalk: and PowerSchool I use this regularly to complete my weekly planning. It is annoying that I have to manually create my timetable instead of being able to upload it. Also it would be great to have a checklist of topics related to the syllabus/specification of content so I can keep track. I really like how visual app is and how I have the option of viewing in daily, weekly and monthly my plans. I would like to create something similiar.
Managebac: This was great as I could have a class stream where I could add resources with the students, but also have an intergrated gradebook related to tasks set. Also the fact that attendance, class drive and reports were all in one place. Consider this for future reference.*
PowerSchool: I like the Resource support section of this site. But I do not pay for it. 
Teacherkit: I like that this has an option of creating a visual seating plan.


**4.2** `TODO:` Write the prompt you'd give a **research agent** to fill the
gaps. Use the ingredients from the table at the top. Starter (improve it!):

```text
You are a product analyst specialising in K-12 education software.
Research these planning tools: <list>.
For each, find: core features, pricing model, which curricula it supports
(ibdp / igcse Edexcel / ial Edexcel), how it handles parallel classes and rotating timetables,
and common complaints from teachers (cite sources: reviews, forums).
Output: one comparison table + a list of gaps none of them fill for a
teacher with <my situation from Part 3>.
Mark anything you could not verify as UNVERIFIED.
```

> ✍️ Your improved research prompt: You are a product analyst specialising in K-12 education software.
Research these planning tools: Chalk, Managebac, PowerSchool and Teacherkit.
For each, find: core features, pricing model, which curricula it supports
(ibdp / igcse Edexcel / ial Edexcel), how it handles parallel classes and rotating timetables,
and common complaints from teachers (cite sources: reviews, forums).
Output: one comparison table + a list of gaps none of them fill for a
teacher with my situation form Part 3.
Mark anything you could not verify as UNVERIFIED.

**4.3** Alberto suggested studying how successful apps work, "reverse
engineering" (see https://github.com/morluto/rea). `TODO:` Open that link
**yourself** and write one sentence on what it does. Don't trust a summary,
human or AI, that you haven't checked.

> ✍️ Your answer: An open-source tool that uses AI to analyse existing websites and apps, understand how they work, and help recreate them without needing their original code.

**4.4** ⚖️ Where's the line? Studying a product's **public features, design
and reviews** is normal practice. Copying its code, data or branding isn't.
What's one idea you'd *borrow* and one thing you'd deliberately do
*differently*?

> ✍️ Your answer: I would borrow the visual aspects of Chalk, but not the part of their Standards option to add to lessons as I feel this lacks any use and is too general.

---

## Part 5 — 📥 Inputs: what the planner needs to read

> 🧠 **Prompt skill: name your inputs precisely.** The AI can only plan with
> what it's given. For each input, say **what it is, where it lives, what
> format it's in, and whether it's sensitive**. "The syllabus" is vague.
> "The Pearson Edexcel IAL Business specification PDF, spec points 1.1–4.6"
> is precise.

**5.1** `TODO:` Fill in the inputs table. Add rows for anything missing.

| Input | Example | Where it lives | Format | Updated how often? | Sensitive? 🔒 |
|---|---|---|---|---|---|
| Syllabus / specification | IAL Business spec | | PDF | | No |
| Scheme of Work / long-term plan | | | | | |
| Timetable (two-week cycle) | | SIMS? | | | |
| School calendar (holidays, INSET, mocks) | | Teams? | .xlsx | | |
| **Assessment calendar** (formal assessments, mocks, deadlines) | | | | | |
| **Report calendar** (report deadlines, data drops) | | | | | |
| Parents' evenings | | SchoolCloud | | | |
| Chapter PowerPoints | | OneDrive? | .pptx | | |
| Past papers + mark schemes | | Examwizard | PDF | | ⚠️ copyright |
| Student data (grades, SEN/EAL flags) | | SIMS | | | 🔒 YES |
| Other: | | | | | |

All inputs you will need for now are in this folder and are not sensitive: [resources](../../../resources) Please structure files the same as One Drive in future - a downloaded version of the One Drive folder respository is here.

Syllabus/specifications and textbooks are here and are not sensitive: 
[ial Specification & Textbook](../../../resources/ial/ial%20Specification%20%26%20Textbook) 
[ibdp Textbook & Guide](../../../resources/ibdp/ibdp%20Textbook%20%26%20Guide)
[igcse Textbook and Specification](../../../resources/igcse/igcse%20Textbook%20and%20Specification)

Schemes of work and Long term plans are here and are not sensitive:
[Planning](../../../resources/igcse/Planning)
[Planning](../../../resources/ibdp/Planning)
[Planning](../../../resources/ial/Planning)

Timetable is here and is not sensitive: ![timetable.png](../../../resources/timetable.png)

School Calendar is here and is not sensitive:
[Hastings School - Calendar 26-27 (Teaching) updated Oct26.pdf](../../../resources/Hastings%20School%20-%20Calendar%2026-27%20%28Teaching%29%20updated%20Oct26.pdf)
[2026-27 Secondary Calendar ALL STAFF.xlsx](../../../resources/2026-27%20Secondary%20Calendar%20ALL%20STAFF.xlsx)
![calendar_tabs_1.png](../../../resources/calendar_tabs_1.png)
![calendar_tabs_2.png](../../../resources/calendar_tabs_2.png)

Assessment Calendars are here and are not sensitive:
[Hastings School - Calendar 26-27 (Teaching) updated Oct26.pdf](../../../resources/Hastings%20School%20-%20Calendar%2026-27%20%28Teaching%29%20updated%20Oct26.pdf) See the tab "Report deadlines" for report calendar and assessment dates like Mocks or Official Exams.
ibdp assessments: 
[Assessments](../../../resources/ibdp/Assessments)
[IBDP Hastings_Course Outline_Business Management_SL&HL 2026-27.docx](../../../resources/ibdp/Planning/IBDP%20Hastings_Course%20Outline_Business%20Management_SL%26HL%202026-27.docx)
ial assessments:
[Unit 4 Assessments](../../../resources/ial/1.%20Content/Y13%20Content/Unit%204%20Global%20Business/Unit%204%20Assessments)
[Y13 Unit 4 Planning.xlsx](../../../resources/ial/1.%20Content/Y13%20Content/Unit%204%20Global%20Business/PLANNING/Y13%20Unit%204%20Planning.xlsx)
igcse assessments:
[Assessments](../../../resources/igcse/Assessments)
[Y11 IGCSE Assessment Schedule.docx](../../../resources/igcse/Planning/Y11%20IGCSE%20Assessment%20Schedule.docx)
[Y11 Long Term Planning.xlsx](../../../resources/igcse/Planning/Y11%20Long%20Term%20Planning.xlsx)

Parents Evenings are in a tab here and not sensitive: (I can give more detailed info later when parents schedule on SchoolCloud)
[2026-27 Secondary Calendar ALL STAFF.xlsx](../../../resources/2026-27%20Secondary%20Calendar%20ALL%20STAFF.xlsx)
![calendar_tabs_1.png](../../../resources/calendar_tabs_1.png)
![calendar_tabs_2.png](../../../resources/calendar_tabs_2.png)

Chapter PowerPoints and content live in Onedrive and here:
ial: [1. Content](../../../resources/ial/1.%20Content) and in particular for this year's timetable: [Unit 4 Global Business](../../../resources/ial/1.%20Content/Y13%20Content/Unit%204%20Global%20Business)
ibdp: [1. Content](../../../resources/ibdp/1.%20Content) and for Internal Assessment prep that needs to be happening from February onwards [IA Intro & Tasks](../../../resources/ibdp/IA/IA%20Intro%20%26%20Tasks)
igcse: [1. Content](../../../resources/igcse/1.%20Content) and in particular for this year's timetable: [Y11 Content](../../../resources/igcse/1.%20Content/Y11%20Content)

Some Past Papers and Mark Schemes live here and are not sensitive but do have copyright (rest are in Exam Wizard for igcse and ial and Question Bank for ibdp):
ial unit 4: [Past Papers](../../../resources/ial/1.%20Content/Y13%20Content/Unit%204%20Global%20Business/U4%20Exam%20Preparation/Past%20Papers)
Extra exam preparation ial:
[Pre Exam Practice - Per Topic](../../../resources/ial/1.%20Content/Y13%20Content/Unit%204%20Global%20Business/U4%20Exam%20Preparation/Pre%20Exam%20Practice%20-%20Per%20Topic) 
[Unit 4 Command Terms General Qs](../../../resources/ial/1.%20Content/Y13%20Content/Unit%204%20Global%20Business/U4%20Exam%20Preparation/Unit%204%20Command%20Terms%20General%20Qs)
igcse: [Past Papers](../../../resources/igcse/igcse%20Exam%20Preparation/Past%20Papers)
Extra exam preparation igcse: [Topic Exam Practice](../../../resources/igcse/igcse%20Exam%20Preparation/Topic%20Exam%20Practice)



**5.2** For the **assessment calendar**: how many formal assessments per term
per group? Who sets the dates: you, the department, or the school?

> ✍️ Your answer: For each group minimum we need two assessments per term. For igcse the assessments are decided by out head of department for now, but I can also do 2 non-formal versions so could be still worth planning. 
> For ibdp and ial I need to come up with minimum two assessments - these are normally timed exam practice for ial, and for ibdp they stem mostly from timed exam practice, but also includes any projects. Prompt me for a breakdown example of weightings.
> ial Y13: two in term 1, Mock and one other in term 2. Term 3 is official external exams.
> igcse Y11: two in term 1, Mock and one other in term 2. Term 3 is official external exams.
> ai examiner prototype will be very useful here for preparing and marking.

**5.3** For the **report calendar**: what has to be ready for a report
(grades, comments, effort scores…)? How far ahead do you need a reminder?

> ✍️ Your answer: See "Report deadlines" in [2026-27 Secondary Calendar ALL STAFF.xlsx](../../../resources/2026-27%20Secondary%20Calendar%20ALL%20STAFF.xlsx)
> Reports are made up of Current Attainment Grade (CAG not sent home), Projected Attainment Grade (PAG sent home) and then Behaviour, Attitude to Learning and Independent Study are rated out of 4, 1 being great, 4 needing attention.

**5.4** Should the planner ever see **student data**? If yes, which
fields, and why? (Tip: the safest data is data the app never touches. See
Part 9.)

> ✍️ Your answer: It would be good for it to have an idea of average marks or if there was a certain exam practice question that many in the class underperformed to inform future planning. In the future I may consider combining the markbook with the planner. (ai examiner prototype will be also useful here)

**5.5** 🤔 Which of these inputs could you give the app **on day one**, and
which would need permission from IT or the department?

> ✍️ Your answer: All on day one.

---

## Part 6 — 🧩 Features: what the planner does

> 🧠 **Prompt skill: prioritise, or the AI will build everything shallowly.**
> Use **MoSCoW**: **M**ust have (useless without it), **S**hould have
> (important, not fatal), **C**ould have (nice bonus), **W**on't have *this
> version* (saying no is a feature). A good first version has 3–5 Musts.

`TODO:` Give each feature an **M / S / C / W** and answer its question.
Strike out ~~ideas you hate~~. Add your own at the bottom.

### 6A. Planning and pacing
| # | Feature | M/S/C/W | Question for you | Your answer |
|---|---|---|---|---|
| 1 | Spec → lesson sequence: pick topics, set lessons per topic, auto-spread over real teaching weeks (holiday-aware) | M | Do you decide lessons-per-topic, or should the AI suggest them? | Suggest them, but consider some of the long term planning dcuments we have in terms of overall timings in lessons. And also the anticipated topics that may be tricy for students. |
| 2 | Parallel-group parity tracker: e.g. '12B is 2 lessons behind 12A on topic 3.2' | M | Would you rather be warned, or have the app suggest catch-up options (merge two lessons, set as homework…)? | Both |
| 3 | Tile/board view: topics as columns, lessons as cards you drag around, Trello style | M | Columns = topics, weeks, or groups? | I would like the planner to be in the same format as my timetable so that I can easily compare, especially as my school has a two week schedule. |
| 4 | Spec-coverage checklist: every spec point ticked when taught and when assessed | S | Is 'taught but never assessed' a gap you'd want flagged? | Yes, although I will not be able to assess every aspect of the specification. |
| 5 | Lost lesson re-planner: a snow day / trip / INSET is added → the rest of the term reflows | S | Should it reflow automatically or ask you first? | Check with me first - but give me a preview of what the reflow is. |
| 6 | Cover-lesson generator for when you're absent | S | What should the generator include or take into account? | What was previously planned for the day missed so that we can try and still cover some of those objectives with independent work. |

### 6B. Resources and tasks
| # | Feature | M/S/C/W | Question for you |
|---|---|---------|---|
| 7 | Resource refresher: reads a chapter PowerPoint and suggests where to insert current-events slides (real companies, recent news), with sources. | M       | Output as suggested slides to paste, or a list of 'after slide 12, add…'? Answer: Yes suggested slides to paste but also a suggested about where to include it to maintain flow. |
| 8 | AI-resistant independent tasks, by year group (see 📝 draft below). | S       |  |
| 9 | Class activity ideas linked to a teaching-strategy library (retrieval practice, think-pair-share, debates…). |         | Which strategies do you already use and love? Answer: I do like the idea of retrieval practice suggestions and other active learning, as long as they are not too time consuming in ial or igcse classes, as I have more time and flexibility in ibdp lessons. |
| 10 | Differentiation: stretch and challenge / support versions of a task. | C       |  |
| 11 | Fresh exam practice: new case studies and question variants in the board's style, so leaked answers don't help. | W       | ⚠️ This overlaps with the AI Examiner and Homework Companion prototypes. Where should it live? Answer: This may be better to be in the AI Examiner prototype, so you can remind me then. |

📝 **Draft for feature 8: check and correct.**

> - **Y11 and Y12:** independent tasks that **check understanding**, so I
>   can see whether a concept landed.
> - **Y13, before the lesson:** preview the new content and **come to
>   class with doubts/questions** (flipped learning).
> - **Y13, after the lesson:** **review content already covered** and
>   **make their own connections to the real world**.
> - In general: tasks should be hard to hand to an AI. That points towards 
> - judgement, local or recent global examples, and students' own
>   questions, not plain fact recall. They also should involve the student practicing the PBLT structure of paragraphs.
> - Consider the creation of resources in the ai content creator prototype.

> ✍️ Corrections / additions:

**6.1** 🤔 Give one example of a task you set recently that a student
*could* have completed with AI, and how you'd change it so they couldn't.

> ✍️ Your answer: Notetaking from a chapter of the textbook - they could have uploaded the pdf and asked AI to summarise it for them.

### 6C. Calendars and tracking

| # | Feature | M/S/C/W | Question for you |
|---|---|---|---|
| 12 | Assessment calendar view: all groups' assessments on one screen, with clash warnings (e.g. two deadlines in mock week). | S |  |
| 13 | Report calendar + reminders: 'Y12 reports due in 10 days; 2 groups have no assessment grade yet'. | M | Reminder by email, Teams, or in-app? Answer: In app reminder for now |
| 14 | Lesson reflection log: a one-line 'what worked / what didn't' after each lesson, shown to you next year. | C |  |
| 15 | Export: to PowerPoint / Word / Excel / Teams. | M | Which one do you actually open every day? Answer: All of them all day long. |

### 6D. The bigger "360 platform" (later, probably)
| # | Feature | M/S/C/W | Question for you |
|---|---|---|---|
| 16 | Student view: see upcoming pre-lesson tasks and assessment dates. | S |  |
| 17 | Parent view: see upcoming assessments / report dates. | W | Is this helpful or a source of extra emails? 😅 Answer: Source of extra emails, especially with older students (15-18 years ld) |
| 18 | Department view: Head of Department sees coverage across all teachers. | C |  |
| 19 | Shared resource library across the department. | S |  |

### 6E. Your own ideas

**6.2** If version one could do **only one** feature brilliantly, which
one, and why?

> ✍️ Your answer: Lesson sequencing in relation to my timetable and the exam boards I teach.

---

## Part 7 — 👥 Users and roles: who sees what

> 🧠 **Prompt skill: constraints protect you.** AIs tend to say "yes" to
> everything. Telling it clearly who must *not* see something is just as
> important as describing the features. In software this is called
> **role-based access control (RBAC)**: each role gets specific permissions.

**7.1** `TODO:` Fill in the permission matrix with **E** (edit), **V**
(view), or **–** (no access).

| Feature / data | 🧑‍🏫 Teacher | 🎓 Student | 👪 Parent | 🛠️ Admin | 👩‍💼 Head of Dept? |
|---|---|---|---|---|---|
| Scheme of Work | E |  |  |  | E |
| Lesson plans and cards | E |  |  |  | V |
| Chapter PowerPoints | E |  |  |  |  |
| Pre-lesson / independent tasks | E | V |  |  |  |
| Assessment calendar | E |  |  |  | E |
| Report calendar | E |  |  |  | V |
| Exam practice (questions) | E |  |  |  |  |
| Exam practice (mark schemes) | E | ⚠️ | ⚠️ |  |  |
| Parity / coverage tracker | E |  |  |  |  |
| User accounts and roles | E |  |  | E |  |

**7.2** Who is "Admin" in real life: school IT, the Head of Department, or
you? Do we need a separate **Head of Department** role?

> ✍️ Your answer: Yes a Head of department role view option could be interesting in the future. And also a Head of Curriculum.

**7.3** Should a student see **only their own group's** tasks, or all three
parallel groups'? Why might that matter?

> ✍️ Your answer: Only their own group - comparing causes more problems and parent emails etc.

**7.4** 🤔 Name one thing that would cause a **real problem** if the wrong
role could see it.

> ✍️ Your answer: A head of department seeing a planned cover lesson before being notified of the absence. Or a parent seeing what their child has missed out on due to missed lesons (holidays etc) 

---

## Part 8 — 🎨 Look and feel

> 🧠 **Prompt skill: show, don't just tell.** "Modern and clean" means
> something different to everyone. Naming specific apps you like ("cards
> like Trello, sidebar like Notion") and saying *why* gives the AI something
> concrete to aim for. Screenshots are even better.

**8.1** Name **3 apps whose look you love** and the specific thing you love
about each. (Trello's cards? Notion's calm pages? Canva's templates?)

> ✍️ Your answer: 
> Chalk: visual and simplicity.
> Trello: scheduling feature.
> Notion: workspaces and seeing visual progress.

**8.2** Name **1 app whose look you hate**, and why. (It might be one you use
at school…)

> ✍️ Your answer: SIMs next generation - very difficult to use.

**8.3** `TODO:` Save 2–5 screenshots of designs you like into
`prototypes/ai_teacher_planner/docs/design_inspiration/`. 🔒 Make sure no
student names or data are visible.

**8.4** Quick preferences (circle one):

- Device you'll plan on most: **laptop**
- dark mode
- Colour-code by: **group, topic, year, and curriculum** Maybe follow the colours in my ![timetable.png](../../../resources/timetable.png) for groups and subjects.
- Density: **calm and spacious**

> ✍️ Your answer:

**8.5** What's the **first screen** you want to see when you open the app on
a Monday morning?

> ✍️ Your answer: Daily Planner and reminders for the week ahead.

---

## Part 9 — 🔒 Constraints and non-negotiables

> 🧠 **Prompt skill: hard rules go in writing, near the top.** Anything that
> must *never* happen should be stated as a rule ("MUST NOT…"), not a hope.
> The AI follows explicit rules far more reliably than implied ones.

**9.1** 📝 **Draft: already decided (check you agree).**

> - 🔒 **Credentials stay local.** School passwords and Microsoft login
>   tokens stay on the teacher's machine and are **never** sent to any AI
>   model.
> - 🔒 **No real student names** in anything the AI sees or that gets
>   committed. Use anonymised labels (`student1`, `12A`).
> - 🔒 **Student personal data** (grades, SEN, EAL) is treated as
>   sensitive under UK/EU data-protection law. Data minimisation: don't
>   collect it unless a Must-have feature needs it.
> - 👩‍🏫 **Human in the loop.** The teacher reviews every AI-generated
>   resource, task or question **before students see it**.
> - ⚖️ **Copyright.** Past papers and mark schemes belong to the exam
>   boards. The app may use them as or as actual resources for tasks or as **style references * for new questions,
>   but must not republish them as its own. Consider this for the ai content creator prototype.
> - 🧱 **Tech stack (Alberto's decision).** TypeScript + React web app,
>   modular, so it can later join a wider "360 platform" for teachers,
>   students and parents. This replaces the earlier Python plan
>   (ADR-003); you'll write the ADR in Part 11.

> ✍️ Anything you disagree with or want to add?

**9.2** What would your **school** (IT, safeguarding lead, leadership) need
to approve before you could use this with real classes?

> ✍️ Your answer: They may need to give me access natively to Microsoft 365 on my Mac. 
> Right now I have downloaded my folders and added them here: [resources](../../../resources) but in the future it would be great to have them automatically updated and synced.

**9.3** Budget: is any paid service OK (AI API costs, hosting), or must it
be free?

> ✍️ Your answer: Free

**9.4** 🤔 Which rule in 9.1 do you think an AI is **most likely** to break
if you don't spell it out? Why?

> ✍️ Your answer: Maybe the copyright with resources found - include references when needed.

---

## Part 10 — 📐 General specs: user stories and acceptance tests

> 🧠 **Prompt skill: specify behaviour, not vibes.** A **user story** says
> *who* wants *what* and *why*. An **acceptance test** (written in
> **BDD** style: *Given / When / Then*) says exactly how you'd check the
> story is done. These are the most powerful lines in your prompt, because
> the AI can turn them straight into automated tests.

### Worked example (copy this shape)

> **Story:** As a **teacher with three parallel IAL groups**, I want to
> **see which group is behind on the Scheme of Work**, so that **all
> three get the same content before the assessment**.
>
> **Acceptance test:**
> - **Given** groups 12A, 12B and 12C are all planned to finish topic 3.2
>   by Friday of week 6
> - **And** 12B loses a lesson to an INSET day in week 5
> - **When** I open the parity tracker
> - **Then** I see 12B flagged as **1 lesson behind** on topic 3.2
> - **And** I'm offered at least one catch-up option

**10.1** `TODO:` Write **3–5 user stories** for your Must-have features
from Part 6.

> ✍️ Story 1:
> As a Business teacher, I want to upload my subject syllabus, Scheme of Work, planning documents, school calendar and personal timetable so that the 
> platform can automatically create a visual teaching schedule, allocating the appropriate number of lessons to each syllabus 
> topic while accounting for holidays, two-week timetables and my preferred teaching order.
>
> ✍️ Story 2:
> As a Business teacher, I want the platform to track which syllabus topics and assessment objectives (AOs) have been taught and 
> assessed so that I can identify gaps in curriculum coverage, ensure appropriate depth of teaching and make sure students are 
> adequately prepared for their examinations.
>
> ✍️ Story 3:
> As a Business teacher, I want the platform to analyse my existing chapter PowerPoints and suggest relevant updates using current 
> business news, real companies and examples so that my teaching resources remain relevant and engaging without having to create 
> entirely new lessons.

**10.2** `TODO:` Write **one Given/When/Then acceptance test** for each story.

> ✍️ Test for story 1:
> Given I have uploaded my subject syllabus, Scheme of Work, planning documents, school calendar and personal timetable, 
> When I select a class, subject and preferred teaching order, 
> Then the platform should automatically generate a visual teaching schedule showing when each syllabus topic should be taught, how many lessons are allocated to it and how the content fits around school holidays, assessment dates and my two-week timetable. This should be part of the ai content creator prototype also.
>
> ✍️ Test for story 2:
> Given I teach three parallel Y13 Business classes with different lesson schedules, 
> When one class misses a lesson because of a school holiday or teacher absence, 
> Then the platform should identify the difference in progress, highlight which topics are affected and suggest practical ways to bring the group back into alignment without requiring me to manually reorganise the entire teaching schedule.
>
> ✍️ Test for story 3:
> Given I have uploaded an existing chapter PowerPoint covering a specific syllabus topic, 
> When I request a resource update, or if there is a current even that is relevant to a topic I could be notified
> Then the platform should identify relevant recent business news and real-world examples, suggest where they could be incorporated into my existing presentation and provide reliable sources, without automatically replacing my original teaching materials.Again this task is related to the ai content creator prototype.

**10.3** **Non-functional specs** are about *how well* it works, not *what*
it does. Fill in what matters to you:

| Quality | Your requirement |
|---|---|
| Speed | Everyday functions should feel almost instantaneous; AI tasks can take longer but should show progress. |
| Works offline? | At minimum, previously downloaded lesson plans, timetables and teaching resources should remain accessible. |
| Accessibility | Yes to all. Simple navigation, readable fonts and a consistent visual layout. |
| Privacy | Yes when necessary |
| Time to learn it | About 5-10minutes more or less. They should not need extensive training. |

**10.4** 🤔 Look at your Story 1. Could two different developers read it
and build two *different* things? If yes, what detail is missing?

> ✍️ Your answer: They may not do it for the appropriate exam board - therefore it will end up being too generic for the user.

---

## Part 11 — 🛠️ Engineering practices: ADR, TDD, BDD

> 🧠 **Prompt skill: tell the AI *how* to work, not just *what* to build.**
> Left alone, an AI will happily write 2,000 lines of untested code in one
> go. Asking it to follow a process (spec first, decisions recorded, tests
> before code) gives you something you can check at each step.

| Practice | Plain-English meaning | Teaching analogy |
|---|---|---|
| **Spec-driven development** | Agree *what* it does in writing before building | Writing the mark scheme before the exam |
| **ADR** (Architecture Decision Record) | A one-page note: the decision, why, and the trade-offs | Minutes from a department meeting: "we chose textbook X because…" |
| **TDD** (Test-Driven Development) | Write a failing test first, then the code that passes it | Setting the success criteria before the lesson |
| **BDD** (Behaviour-Driven Development) | Tests written as Given/When/Then stories anyone can read | Your Part 10 acceptance tests! |

**11.1** `TODO:` Draft **ADR-005** in `docs/adr/005-planner-typescript-react.md`,
using `docs/adr/template.md`. Fill in **Context** (why Python stopped being
enough for the planner), **Decision**, and **Consequences** (one good
thing, one trade-off). Ask Alberto about anything you're unsure of. That's
part of the exercise.

> ✍️ Done? (y/n) and one sentence on the hardest part:

**11.2** Pick your **Story 1** from Part 10. Describe in words the **first
failing test** the AI should write. (Not code, just *what* it checks.)

> ✍️ Your answer:

**11.3** What's your **"definition of done"** for a feature? (e.g. tests
pass + Gemma has clicked through it + no student data stored…)

> ✍️ Your answer:

**11.4** 🤔 Why might it be *risky* to let an AI write the code **and** the
tests for that code, all on its own?

> ✍️ Your answer:

---

## Part 12 — 🚀 The assembled master prompt

> 🧠 **Prompt skill: structure and output format.** Long prompts work best
> with clear sections (XML-style tags help Claude tell them apart), the
> most important rules near the top, and an **exact description of the
> output you want**. Asking the AI to **ask clarifying questions first**
> and to **label its assumptions** stops it confidently inventing things.

**12.1** What do you want the AI to hand back? Tick:

- [x] A written **spec** (`docs/superpowers/specs/…-ai-teacher-planner-design.md`)
- [x] A list of **ADRs** to write (one per big decision)
- [x] A **phased roadmap**: MVP → v2 → "360 platform"
- [x] **Mermaid diagrams** (architecture, user flow, roles)
- [x] A **step-by-step build plan** with tests first (TDD)
- [x] A **risk list** (privacy, copyright, AI hallucination, school approval)
- [x] A list of **open questions** for me
- [ ] Other:

**12.2** `TODO:` Once Parts 1–11 are done, copy this skeleton, replace each
`{{…}}` with your answers (or paste the whole part), and give it to Claude
Code in this repo.

```text
<role>
{{Part 1.2 — your role sentence}}
</role>

<hard_rules>
These rules override everything else. If a request conflicts with them, stop
and tell me.
{{Part 9.1 — the non-negotiables, as MUST / MUST NOT statements}}
</hard_rules>

<context>
{{Part 2 — me, my school, my teaching load, my timetable}}
</context>

<problem>
{{Part 3 — my planning week, ranked pains with minutes lost, anti-goals}}
</problem>

<prior_art>
{{Part 4 — what I've learned about existing tools; ideas to borrow / avoid}}
</prior_art>

<inputs>
{{Part 5 — the inputs table, including assessment and report calendars}}
</inputs>

<features>
{{Part 6 — features with MoSCoW priority; the one thing v1 must do brilliantly}}
</features>

<roles_and_permissions>
{{Part 7 — the permission matrix}}
</roles_and_permissions>

<design>
{{Part 8 — apps I love/hate and why; first screen; preferences}}
</design>

<specs>
{{Part 10 — user stories, Given/When/Then acceptance tests, non-functional specs}}
</specs>

<how_to_work>
- Follow spec → plan → build. Do not write application code until I approve
  the spec.
- Record each significant decision as an ADR in docs/adr/ using the template.
- Use TDD: a failing test before each piece of code. Turn my Given/When/Then
  tests into automated tests.
- Tech stack: TypeScript + React, modular so it can later join a wider
  platform for teachers, students and parents.
{{Part 11.3 — my definition of done}}
</how_to_work>

<task>
Using everything above, produce a complete "360" plan for the AI Teacher
Planner.
Before you start: ask me up to 5 clarifying questions about anything that
would change what gets built, then wait for my answers.
</task>

<output_format>
{{Part 12.1 — the deliverables I ticked, in that order}}
Label every assumption you make as ASSUMPTION.
Label anything about real products, exam boards or laws you could not verify
as UNVERIFIED.
</output_format>
```

**12.3** 🧪 **Test your prompt** before using it for real: give it to Claude
and read *only the clarifying questions* it asks back. Each question is a
gap in your prompt. Fill the gap here, then run it again.

> ✍️ Questions it asked → what you added:

---

## Part 13 — 🪞 Reflection

**13.1** Which prompt skill from this file surprised you most?

> ✍️ Your answer:

**13.2** Take a prompt you used with AI last month (for a lesson, an email,
anything). Rewrite it using the ingredients table at the top. What changed?

> ✍️ Your answer:

**13.3** Where else at school could you reuse this **template approach**
(role → context → problem → constraints → specs → output)?

> ✍️ Your answer:

### 🧭 You know you've got it when…

- You can explain to a colleague why "make me a lesson plan" gets a worse
  result than a prompt with context, constraints and an output format.
- You can write a Given/When/Then test for a teaching task without looking
  at the example.
- You've written an ADR and can say what "trade-off" you accepted.
- Claude's clarifying questions on your master prompt are **few and
  specific**, not "what subject do you teach?"
- You check an AI's claims about real products and exam boards instead of
  trusting them.

---

## 📖 Glossary

| Term | Meaning |
|---|---|
| **Prompt engineering** | Writing instructions so an AI reliably produces what you need |
| **Role prompting** | Starting with "You are a…" to set expertise and standards |
| **Context window** | Everything the AI can "see" at once: your prompt plus files |
| **Hallucination** | When an AI states something false with confidence |
| **MoSCoW** | Must / Should / Could / Won't: a way to prioritise features |
| **User story** | "As a… I want… so that…" |
| **BDD** | Behaviour-Driven Development: tests as Given / When / Then |
| **TDD** | Test-Driven Development: failing test → code → passing test |
| **ADR** | Architecture Decision Record: a one-page "what we decided and why" |
| **RBAC** | Role-Based Access Control: permissions by role (teacher, student…) |
| **MVP** | Minimum Viable Product: the smallest version that's genuinely useful |
| **Spec** | Specification: the agreed written description of what gets built |

---

Finished? Save, commit and push, just like with `QUESTIONS_FOR_GEMMA.md`.
Then open Claude Code in this repo and paste your Part 12 prompt. 💛

// TODO: pre wrapup before prompt and /plan
Tech. Lead
1. Claude harness set up for the project: CLAUDE.md, relevant .mds, etc. Develop SKILS when repeated actions are done more than twice from the teacher prespective part resorting to AI frontier models (when needed)
2. frontend + GUI must represent which parts have been generated automatically (by the pure backend logic) and which parts have been resorted to GenAI (in this case Claude Code, in the future could be others, local LLMs, MCPs, Gemini or ChatGPT): we need to show the user in the GUI (icons) which part is IA generated. But we need heavily resort to the Claude Harness to lean on when needed, we just need to represent the icon in the GUI when it is worth noting the user
3. implement all of this in this branch
4. install the needed libraries in this laptop: pnpm, npm, node, etc
5. use docs/ and docs/design folder that represent the arhitecture visually of the technical stack, software modules, frontend, backend, middleware, components, communciation with Frontier models, etc
6. delete tables for inputs and wrap up inverse engineering
7. .gitignore local files and private repo (for me)
8. link input table (and others) M S C W, content creator for .md (s for future features and modules, not now)
  - references to the examiner
ADDED/FIXED
  - ai content creator prototype
  - ai examiner prototype
  - tables deleted where appropriate