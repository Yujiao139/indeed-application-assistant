import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchUrl, scoreJob, toCsv } from "../src/core.js";

test("builds Canadian Indeed search URL", () => {
  const url = new URL(buildSearchUrl("ca.indeed.com", "IT support", "Halifax, NS", { daysOld: 7 }));
  assert.equal(url.hostname, "ca.indeed.com");
  assert.equal(url.searchParams.get("l"), "Halifax, NS");
  assert.equal(url.searchParams.get("fromage"), "7");
});

test("rejects senior roles and scores matching roles", () => {
  const search = { query: "IT support OR help desk" };
  const filters = { excludeTitleKeywords: ["senior"] };
  assert.equal(scoreJob({ title: "Senior IT Support", description: "", easyApply: true }, search, filters).score, -100);
  assert.ok(scoreJob({ title: "IT Support Technician", description: "help desk", easyApply: true }, search, filters).score >= 4);
});

test("escapes CSV cells", () => {
  const csv = toCsv([{ title: "Admin, Office", note: "said \"hi\"" }]);
  assert.match(csv, /"Admin, Office"/);
  assert.match(csv, /"said ""hi"""/);
});
