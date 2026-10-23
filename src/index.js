import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { chromium } from "playwright";
import { buildSearchUrl, scoreJob, toCsv } from "./core.js";

const root = path.resolve(import.meta.dirname, "..");
const configPath = path.join(root, "config.json");
const dryRun = process.argv.includes("--dry-run");
const logPath = path.join(root, "data", "applications.csv");
const statePath = path.join(root, "data", "seen.json");

if (!fs.existsSync(configPath)) {
  console.error("缺少 config.json。请先复制 config.example.json 并填写个人信息。");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
validateConfig(config);
const seen = fs.existsSync(statePath) ? new Set(JSON.parse(fs.readFileSync(statePath, "utf8"))) : new Set();
const rows = [];
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const context = await chromium.launchPersistentContext(path.join(root, ".indeed-profile"), {
  headless: false,
  viewport: { width: 1400, height: 950 },
  locale: "en-CA"
});
const page = context.pages()[0] || await context.newPage();

try {
  let handled = 0;
  outer: for (const search of config.searches) {
    for (const location of config.locations) {
      const searchUrl = buildSearchUrl(config.countryDomain, search.query, location, config.filters);
      console.log(`\n搜索 [${search.category}] ${location}\n${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(2500);
      await dismissPopups(page);
      const jobs = await collectJobs(page);

      for (const job of jobs) {
        if (handled >= config.filters.maxJobsPerRun) break outer;
        if (!job.url || seen.has(job.jobKey)) continue;
        if (config.filters.easyApplyOnly && !job.easyApply) continue;
        const scored = scoreJob(job, search, config.filters);
        if (scored.score < config.filters.minimumScore) continue;

        handled += 1;
        console.log(`\n${job.title} — ${job.company} (${job.location})\n分数 ${scored.score}: ${job.url}`);
        if (dryRun) {
          record(job, search.category, scored.score, "shortlisted", "dry run");
          seen.add(job.jobKey);
          continue;
        }

        const answer = (await rl.question("打开并尝试填写？[y/N/q] ")).trim().toLowerCase();
        if (answer === "q") break outer;
        if (answer !== "y") {
          record(job, search.category, scored.score, "skipped", "user skipped");
          seen.add(job.jobKey);
          continue;
        }

        await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForTimeout(1800);
        const result = await startAndFillApplication(page, config, path.resolve(root, search.resume));
        console.log(result.message);
        record(job, search.category, scored.score, result.status, result.message);
        seen.add(job.jobKey);
        if (result.status === "ready_for_review") {
          await rl.question("请在浏览器检查内容。可由你手动提交；完成后按 Enter 继续（脚本绝不会点击最终提交）。");
        }
      }
    }
  }
} finally {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const oldRows = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8").trim().split("\n").slice(1) : [];
  const newCsv = toCsv(rows).trim().split("\n");
  fs.writeFileSync(logPath, [newCsv[0], ...oldRows, ...newCsv.slice(1)].join("\n") + "\n");
  fs.writeFileSync(statePath, JSON.stringify([...seen], null, 2) + "\n");
  await context.close();
  rl.close();
}

function validateConfig(value) {
  for (const key of ["fullName", "email", "phone"]) {
    if (!value.applicant?.[key] || value.applicant[key] === "请填写") throw new Error(`config.json 中 applicant.${key} 尚未填写`);
  }
  for (const search of value.searches || []) {
    const resume = path.resolve(root, search.resume);
    if (!fs.existsSync(resume)) throw new Error(`找不到 ${search.category} 简历: ${resume}`);
  }
}

async function collectJobs(page) {
  return page.locator("a[href*='/viewjob'], a.jcs-JobTitle").evaluateAll(links => {
    const unique = new Map();
    for (const link of links) {
      const card = link.closest(".job_seen_beacon, .cardOutline, li") || link.parentElement;
      const url = new URL(link.href, location.href);
      const key = url.searchParams.get("jk") || url.pathname + url.search;
      if (!key || unique.has(key)) continue;
      const text = card?.innerText || "";
      unique.set(key, {
        jobKey: key,
        title: link.textContent?.trim() || "",
        company: card?.querySelector("[data-testid='company-name'], .companyName")?.textContent?.trim() || "",
        location: card?.querySelector("[data-testid='text-location'], .companyLocation")?.textContent?.trim() || "",
        description: text,
        easyApply: /easily apply|indeed apply|轻松申请/i.test(text),
        url: url.href
      });
    }
    return [...unique.values()];
  });
}

async function startAndFillApplication(page, cfg, resume) {
  const apply = page.getByRole("button", { name: /apply now|easily apply|申请/i }).or(page.getByRole("link", { name: /apply now|easily apply|申请/i })).first();
  if (!await apply.isVisible().catch(() => false)) return { status: "manual", message: "未找到 Indeed Apply 按钮，可能需要到雇主网站申请。" };
  await apply.click();
  await page.waitForTimeout(1500);

  for (let step = 0; step < 12; step += 1) {
    await fillKnownFields(page, cfg.applicant, resume);
    if (await hasFinalSubmit(page)) return { status: "ready_for_review", message: "已到最终审核页，等待你检查并手动提交。" };
    const next = page.getByRole("button", { name: /continue|next|review your application|继续|下一步|审核/i }).first();
    if (!await next.isVisible().catch(() => false)) return { status: "needs_input", message: "页面含未识别问题，请你在浏览器填写；脚本已停止自动前进。" };
    if (await page.locator("[aria-invalid='true']").count()) return { status: "needs_input", message: "发现必填或校验错误，请你处理。" };
    await next.click();
    await page.waitForTimeout(900);
  }
  return { status: "needs_input", message: "申请步骤过多，已安全停止。" };
}

async function fillKnownFields(page, applicant, resume) {
  const mappings = [
    [/full name|姓名/i, applicant.fullName], [/email|电子邮件/i, applicant.email],
    [/phone|telephone|电话/i, applicant.phone], [/city|城市/i, applicant.city],
    [/linkedin/i, applicant.linkedin], [/years.*experience|工作经验/i, applicant.yearsOfExperience]
  ];
  for (const [label, value] of mappings) {
    if (!value || value === "请填写") continue;
    const input = page.getByLabel(label).first();
    if (await input.isVisible().catch(() => false) && !(await input.inputValue().catch(() => ""))) await input.fill(String(value));
  }
  const file = page.locator("input[type=file]").first();
  if (await file.count()) await file.setInputFiles(resume).catch(() => {});
}

async function hasFinalSubmit(page) {
  const submit = page.getByRole("button", { name: /submit.*application|提交.*申请/i }).first();
  return submit.isVisible().catch(() => false);
}

async function dismissPopups(page) {
  for (const name of [/not now|稍后/i, /close|关闭/i]) {
    const button = page.getByRole("button", { name }).first();
    if (await button.isVisible().catch(() => false)) await button.click().catch(() => {});
  }
}

function record(job, category, score, status, note) {
  rows.push({ timestamp: new Date().toISOString(), ...job, category, score, status, note });
}
