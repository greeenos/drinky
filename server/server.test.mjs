// node --test server/
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, defaultState, tick } from "./server.mjs";

const at = (hhmm) => new Date(`2026-11-02T${hhmm}:00`).getTime(); // a Monday

test("schedules, reminds, counts glasses and stops at the goal", () => {
  const st = defaultState();
  st.settings.dailyGoalMl = 800;

  tick(st, at("08:00"));
  assert.equal(st.nextAt, null, "nothing before working hours");

  tick(st, at("09:00"));
  assert.equal(st.nextAt, at("10:45"));
  tick(st, at("10:45"));
  assert.equal(st.active, true);

  act(st, "drink", at("10:46"));
  assert.deepEqual(
    [st.drankMl, st.active, st.nextAt],
    [400, false, at("12:31")],
  );

  act(st, "snooze", at("12:31"));
  assert.equal(st.nextAt, at("12:36"));

  act(st, "drink", at("12:40"));
  assert.equal(st.drankMl, 800);
  assert.equal(st.nextAt, null, "goal reached, no more reminders");

  tick(st, at("09:00").valueOf() + 86_400_000);
  assert.equal(st.drankMl, 0, "new day resets progress");
});

test("rejects bad settings", () => {
  const st = defaultState();
  assert.throws(() => act(st, "settings", at("09:00"), { glassMl: -1 }));
  assert.equal(st.settings.glassMl, 400);
  assert.equal(act(st, "nope", at("09:00")), false);
});
