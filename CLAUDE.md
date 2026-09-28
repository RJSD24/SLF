# SLF — Self Leveling Fitness — notes for Claude

A fitness tracker styled like a game "System" (Solo Leveling–inspired look).
Name: **SLF — Self Leveling Fitness**. The app itself is not built yet. The
user moved here from the YouTube project
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
  Meeting every target completes the quest and awards XP once for the day.
- **Penalty Quest:** a missed day (after the profile was created) turns the
  next day red, raises targets by 50% and resets the streak. XP is never taken
  away.
- **Level and rank:** XP levels up; ranks E, D, C, B, A, S by level. Each
  level-up gives 5 points to put into STR, AGI, VIT or INT.
- **Titles:** first quest; 3, 7 and 30-day streaks; levels 10, 25, 50; 100 km
  run; 10,000 push-ups.
- **Tabs:** Status, Quest, Log (history), Settings (name, custom exercises,
  backup, reset).
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
