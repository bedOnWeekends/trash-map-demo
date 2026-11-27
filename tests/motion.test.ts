import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Swap } from "../components/motion/patterns";
import { duration, ease, spring, tween } from "../lib/motion";

test("CSS와 Motion의 시간 및 곡선 토큰이 일치한다", () => {
  const css = readFileSync("app/tokens.css", "utf8").replaceAll(" ", "");
  for (const [name, seconds] of Object.entries(duration))
    assert.ok(
      css.includes("--dur-" + name + ":" + Math.round(seconds * 1000) + "ms;"),
      name,
    );
  for (const [name, curve] of Object.entries(ease)) {
    const match = css.match(
      new RegExp("--motion-" + name + ":cubic-bezier\\(([^)]+)\\)"),
    );
    assert.deepEqual(match?.[1].split(",").map(Number), curve);
  }
});
test("개별 패널의 variants와 transition은 공통 프리셋과 독립적이다", () => {
  const local = {
    enter: { opacity: 0 },
    visible: { opacity: 0.8 },
    leave: { opacity: 0 },
  };
  const html = renderToStaticMarkup(
    createElement(
      Swap,
      {
        identity: "local",
        variants: local,
        transition: { ...spring, damping: 45 },
      },
      "독립 패널",
    ),
  );
  assert.match(html, /opacity:0\.8/);
  assert.equal(spring.damping, 38);
  assert.deepEqual(tween(0.42), { duration: 0.42, ease: ease.standard });
});
