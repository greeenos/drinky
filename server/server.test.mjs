// node --test server/server.test.mjs   (run with TZ=Europe/Prague)
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, defaultState, nextDelay, tick } from "./server.mjs";

const at = (hhmm) => new Date(`2026-11-02T${hhmm}:00`).getTime(); // a Monday
const mid = () => 0.5; // no jitter
const HOUR = 3_600_000;

test("spreads the sips left over the rest of the day, with jitter", () => {
  const st = defaultState(); // 2000 ml in 50 ml sips = 40 sips, 9:00-18:00
  assert.equal(nextDelay(st, at("09:00"), mid), Math.round((9 * HOUR) / 41));
  assert.equal(
    nextDelay(st, at("09:00"), () => 0),
    Math.round((9 * HOUR) / 82),
  );
  assert.equal(
    nextDelay(st, at("09:00"), () => 1),
    Math.round((9 * HOUR * 1.5) / 41),
  );
  st.drankMl = 1900; // 2 sips left at 17:00 -> every 20 min
  assert.equal(nextDelay(st, at("17:00"), mid), HOUR / 3);
  assert.equal(nextDelay(st, at("17:58"), mid), 5 * 60_000, "min 5 min gap");
});

test("schedules, reminds, counts sips and stops at the goal", () => {
  const st = defaultState();
  Object.assign(st.settings, { dailyGoalMl: 800, sipMl: 400 });

  tick(st, at("08:00"), mid);
  assert.equal(st.nextAt, null, "nothing before working hours");

  tick(st, at("09:00"), mid);
  assert.equal(st.nextAt, at("12:00"), "2 sips left over 9h -> every 3h");
  tick(st, at("12:00"), mid);
  assert.equal(st.active, true);

  act(st, "drink", at("12:00"), {}, mid);
  assert.deepEqual(
    [st.drankMl, st.active, st.nextAt],
    [400, false, at("15:00")],
  );

  act(st, "snooze", at("15:00"), {}, mid);
  assert.equal(st.nextAt, at("15:05"));

  act(st, "drink", at("15:05"), {}, mid);
  assert.equal(st.drankMl, 800);
  assert.equal(st.nextAt, null, "goal reached, no more reminders");

  tick(st, at("09:00") + 86_400_000, mid);
  assert.equal(st.drankMl, 0, "new day resets progress");
});

test("rejects bad settings", () => {
  const st = defaultState();
  assert.throws(() => act(st, "settings", at("09:00"), { sipMl: -1 }));
  assert.equal(st.settings.sipMl, 50);
  assert.equal(act(st, "nope", at("09:00")), false);
});
