# SLF — Self Leveling Fitness

A personal fitness tracker styled like a game "System": a daily quest, levels,
ranks from E to S, four stats and titles. Miss a day and a penalty quest
waits for you the next morning.

- **STR** grows from push-ups, sit-ups and squats, **AGI** from running,
  **VIT** from hitting your calorie and protein targets, and **INT** from a
  daily 5-question fitness and nutrition quiz.
- Built-in calorie calculator (height, weight, age, sex, activity level and
  goal) that suggests daily calorie and protein targets.
- Works on one device. Progress is saved in the browser, with a backup file
  you can export and import.
- No account and no AI, so it costs nothing to run.
- Plain HTML, CSS and JavaScript with no build step.

## Run it locally

```
node dev.mjs
```

Then open http://localhost:8765. The page reloads by itself whenever a file
in `app/` changes, and the server prints an address a phone on the same
Wi-Fi can open.

Version: 1.0.0. See `CLAUDE.md` for the full design notes.
