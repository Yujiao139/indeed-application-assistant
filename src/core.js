export function buildSearchUrl(domain, query, location, filters = {}) {
  const url = new URL(`https://${domain}/jobs`);
  url.searchParams.set("q", query);
  url.searchParams.set("l", location);
  if (filters.daysOld) url.searchParams.set("fromage", String(filters.daysOld));
  if (filters.remote) url.searchParams.set("sc", "0kf:attr(DSQF7);");
  return url.toString();
}

export function normalize(value = "") {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();
}

export function scoreJob(job, search, filters = {}) {
  const title = normalize(job.title);
  const description = normalize(job.description);
  const excludedTitle = (filters.excludeTitleKeywords || []).find(k => title.includes(normalize(k)));
  if (excludedTitle) return { score: -100, reason: `title excluded: ${excludedTitle}` };
  const excludedDescription = (filters.excludeDescriptionKeywords || []).find(k => description.includes(normalize(k)));
  if (excludedDescription) return { score: -100, reason: `description excluded: ${excludedDescription}` };

  const terms = normalize(search.query)
    .split(/\bor\b/)
    .map(s => s.trim())
    .filter(Boolean);
  let score = 0;
  for (const term of terms) {
    if (title.includes(term)) score += 3;
    else if (description.includes(term)) score += 1;
  }
  if (job.easyApply) score += 1;
  return { score, reason: `${score} keyword/easy-apply points` };
}

export function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows) {
  const headers = ["timestamp", "jobKey", "category", "title", "company", "location", "url", "score", "status", "note"];
  return [headers, ...rows.map(row => headers.map(h => row[h] ?? ""))]
    .map(row => row.map(csvEscape).join(","))
    .join("\n") + "\n";
}
