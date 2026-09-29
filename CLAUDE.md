# SLF — Self Leveling Fitness — notes for Claude

A fitness tracker styled like a game "System" (Solo Leveling–inspired look).
Name: **SLF — Self Leveling Fitness**. The app lives in `app/` (plain
HTML/CSS/JS in the AppDeploy `html-static` layout: `app/index.html`,
`app/src/app.js`, `app/src/styles.css`, quiz bank in
`app/src/questions-a.js` / `questions-b.js`, ids = position, append only).
Built and browser-tested locally (headless Chrome over CDP, test scripts
kept outside the repo); not deployed yet. `?today=YYYY-MM-DD&hour=H` in the
URL fakes the date for testing rollover, penalty and reminder. Serve
locally with `python -m http.server` in `app/` (ES modules need http, not
file://). The user moved here from the YouTube project
(`D:\Code Projects\Website Project\YT Video Automation`, "Shorts Studio") to
start this one.

## The user

- Runs the YouTube channel GoToVirals; also has Roblox projects
  (`D:\RobloxProject\Arcane Engine Studio`). Windows 11, timezone UTC+8
  (Philippines).
- **Not a coder.** Explain in plain words, never ask them to read code, and
  make every setting a button, dropdown or slider rather than text to type.
- **Watches cost closely.** Say plainly what uses AI tokens and what does not;
  anything AI should run only when they click. Running the app itself must
  cost nothing.
- Wants things **verified, not claimed**: test in a real browser (headless
  Chrome over the DevTools protocol worked well in the last project) and show
  what was checked. Be honest when something is untested.
- Likes short replies. They often turn on "caveman mode" (terse replies); that
  applies to chat only, never to code, comments, commits or files like this.
- Keeps code on GitHub as private repos under `Atlaski7`.

## What was decided

- **One device only.** No login, no backend: progress lives in the browser's
  localStorage. Add **export / import backup** (a JSON file) so switching
  phones or clearing the browser doesn't wipe progress.
- **Daily Quest = both:** the classic quest (push-ups, sit-ups, squats, run)
  plus custom exercises the user adds (reps, km or minutes).
- **No AI.** Quests, penalties and titles follow fixed rules. Zero running cost.
- **Hosting:** AppDeploy (MCP connector), frontend-only, `html-static`
  template, plain HTML/CSS/JS with no build step.

## The design

- **Look:** dark navy, cyan glowing "System" windows, pop-ups like
  `[DAILY QUEST HAS ARRIVED]`, `LEVEL UP!`, `Title acquired`.
- **Daily Quest targets** scale with level: start at 10 reps / 1 km, reach
  100 reps / 10 km by level 50. Custom exercises join the same quest.
- **Logging:** +1 / +5 / +10 buttons (+0.5 / +1 for km) or a typed amount.
  Meeting the success rule (below) completes the quest and awards XP once
  for the day.
- **Penalty Quest:** a missed day (after the profile was created) turns the
  next day red, raises STR and AGI targets by 50% and resets the streak. VIT
  (diet) and INT (5 questions) stay unchanged. XP is never taken away.
- **Rest days:** in Settings the user taps weekdays (e.g. Sunday) as rest
  days. Rest days have no quest, never count as missed, and keep the streak.
- **Custom exercises:** when adding one, the user picks STR or AGI; it joins
  that part of the quest.
- **Sound:** short game-style beeps generated in code (Web Audio, no audio
  files) for pop-ups; mute toggle in Settings, on by default.
- **Level and rank:** XP levels up; ranks E, D, C, B, A, S by level.
- **Stats grow automatically from activity** (no manual stat points). Each
  part of the Daily Quest gives up to +5 to its stat:
  - **STR** — push-ups, sit-ups, squats. All three done = +5 STR.
  - **AGI** — running. Run target done = +5 AGI.
  - **VIT** — diet: the user types calories and protein (grams) eaten each
    day. Protein at or above target and calories within 10% of target
    = +5 VIT.
  - **INT** — 5 quiz questions a day on fitness, health and nutrition.
    +1 INT per correct answer (max +5).
- **Quest success rule:** by default **all four** (STR, AGI, VIT, INT) are
  required. A Settings toggle "Require both STR and AGI" (on by default) can
  be turned off, and then VIT + INT + either STR or AGI is enough (the user
  often has no time to run). INT counts as done once all 5 questions are
  answered, whatever the score.
- **Quiz flow:** after each answer, show right/wrong; if wrong, show the
  correct answer (plus a one-line explanation). Then proceed by a **Next**
  button or a **timer** that auto-advances; a Settings dropdown picks Next
  (default) or timed (e.g. 3 / 5 / 10 seconds).
- **Calorie calculator** (in VIT / Settings): height, weight and age can be
  typed or set by slider; sex is two buttons (Male / Female); activity level
  is a dropdown. It shows
  maintenance calories (Mifflin-St Jeor BMR x activity factor). Units:
  metric by default with a kg/lb and cm/ft toggle.
- **Goal dropdown** sets calorie and protein targets:
  - Lose weight: maintenance -500 kcal, protein 2.0 g/kg.
  - Maintain: maintenance, protein 1.6 g/kg.
  - Build muscle (lean bulk): maintenance +250 kcal, protein 2.0 g/kg.
  - Gain weight: maintenance +500 kcal, protein 1.6 g/kg.
  - Safety floor: the calorie target never goes below 1,500 (male) or
    1,200 (female); the app shows a short note when the floor applies.
  - The user can still fine-tune both targets by slider.
- **Daily quiz = built-in question bank** (300+ questions written once by
  Claude in chat, stored in the app). The app picks new questions each day
  with no AI at runtime. The user asked for Claude "over MCP", but a live
  website cannot reach Claude through MCP; this was explained and they chose
  the free bank. To add questions later, they ask Claude in chat.
- **Titles:** first quest; 3, 7 and 30-day streaks; levels 10, 25, 50; 100 km
  run; 10,000 push-ups; each rank-up (E to D, D to C, ...); any stat reaching
  50, 100, 250; perfect quiz (5/5) and 7 perfect quiz days.
- **Diet logging:** per meal. "Add food" takes calories + protein (typed, or
  quick +100 kcal / +10 g buttons); the app sums the day.
- **Quiz** is available all day from local midnight.
- **Reminder:** in-app banner only (no push notifications). When the app is
  opened after a set hour (chosen in Settings), a banner lists what is left
  today.
- **Tabs:** Status, Quest, Log (history), Settings (name, custom exercises,
  calorie calculator, goal and targets, "Require both STR and AGI" toggle,
  quiz Next/timed choice, backup, reset).
- Use local dates (not UTC) for "today", or days roll over at 8 AM for them.

## Plan

1. Build locally in this folder.
2. Test in a browser: logging, completing the quest, level-up, a missed day
   triggering the penalty, backup export and import.
3. Deploy to AppDeploy **once** (see below).
4. Give the user the public link. Put the code in a private GitHub repo.

## Things to watch

- **AppDeploy has a lifetime deploy cap that never resets.** Get it working
  locally first; don't deploy throwaway test versions. Call
  `get_deploy_instructions` before anything else, then `get_app_template`.
- **Name and art:** "Solo Leveling" belongs to its creators. The app is called
  SLF / Self Leveling Fitness on purpose. Borrowing the style (System windows,
  quests, ranks, stats) is fine; don't use their logo, art or character names,
  especially on a public URL.
- **Git Bash heredocs ate backslashes** in the last project: regex like `\s`
  and `\n` inside strings came out broken. Write files containing backslashes
  with the Write/Edit tools, not shell heredocs.
- Last session, the automatic safety check (auto mode) kept erroring and
  blocked every action for a while. If that happens, retry later or ask the
  user to leave auto mode (Shift+Tab) instead of hammering it.
