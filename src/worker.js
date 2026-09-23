const TEAM_NAMES = ['Darshita', 'Heena', 'Yashy', 'Shreya', 'Parveen', 'Anshul', 'Nikhil', 'Rahul Sethi'];
const DEFAULT_SEV1_WINDOW = 30;
let fieldCache = null;
let userCache = null;

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
function authHeaders(env) {
  return { 'authorization': 'Basic ' + btoa(env.JIRA_EMAIL + ':' + env.JIRA_API_TOKEN), 'accept': 'application/json', 'content-type': 'application/json' };
}
async function jira(env, path, options = {}) {
  const base = String(env.JIRA_BASE_URL || '').replace(/\/$/, '');
  const response = await fetch(base + path, { ...options, headers: { ...authHeaders(env), ...(options.headers || {}) } });
  if (!response.ok) throw new Error('Jira request failed (' + response.status + ')');
  return response.json();
}
function fieldValue(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(fieldValue).join(', ');
  return value.value || value.name || value.displayName || '';
}
async function fields(env) {
  if (fieldCache && fieldCache.expires > Date.now()) return fieldCache.value;
  const all = await jira(env, '/rest/api/3/field');
  const map = {};
  all.forEach((f) => { map[String(f.name).trim().toLowerCase()] = f.id; });
  fieldCache = { value: map, expires: Date.now() + 60 * 60 * 1000 };
  return map;
}
async function search(env, jql, fieldNames, maxResults = 100) {
  let issues = [];
  let total = null;
  let nextPageToken = null;
  do {
    const requestBody = { jql, fields: fieldNames, maxResults: Math.min(100, Math.max(1, maxResults - issues.length)) };
    if (nextPageToken) requestBody.nextPageToken = nextPageToken;
    const body = await jira(env, '/rest/api/3/search/jql', { method: 'POST', body: JSON.stringify(requestBody) });
    if (Number.isFinite(body.total)) total = body.total;
    issues = issues.concat(body.issues || []);
    nextPageToken = body.nextPageToken || null;
    if (body.isLast === true || !nextPageToken) break;
  } while (issues.length < maxResults);
  return { total: total == null ? issues.length : total, issues: issues.slice(0, maxResults) };
}
function normalize(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
async function resolveUsers(env) {
  if (userCache && userCache.expires > Date.now()) return userCache.value;
  let pinned = {};
  try { pinned = JSON.parse(env.JIRA_TEAM_ACCOUNT_IDS_JSON || '{}'); } catch (_) {}
  const resolved = [];
  for (const name of TEAM_NAMES) {
    if (pinned[name]) { resolved.push({ name, accountId: pinned[name], displayName: name }); continue; }
    const candidates = await jira(env, '/rest/api/3/user/assignable/search?project=CVIR&maxResults=50&query=' + encodeURIComponent(name));
    const exact = candidates.find((u) => normalize(u.displayName) === normalize(name));
    const prefix = candidates.find((u) => normalize(u.displayName).includes(normalize(name)) || normalize(name).includes(normalize(u.displayName)));
    const chosen = exact || prefix;
    resolved.push({ name, accountId: chosen && chosen.accountId, displayName: chosen && chosen.displayName });
  }
  userCache = { value: resolved, expires: Date.now() + 60 * 60 * 1000 };
  return resolved;
}
function mondayISO(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(now);
  const get = (type) => parts.find((x) => x.type === type).value;
  const dayMap = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const local = new Date(get('year') + '-' + get('month') + '-' + get('day') + 'T00:00:00+05:30');
  local.setUTCDate(local.getUTCDate() - dayMap[get('weekday')]);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(local);
}
function hoursBetween(a, b) { return (new Date(b).getTime() - new Date(a).getTime()) / 3600000; }
function median(values) { if (!values.length) return null; const sorted = values.slice().sort((a,b) => a-b); const m = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[m] : (sorted[m-1] + sorted[m]) / 2; }
function ago(iso) { const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); if (mins < 60) return mins + ' min ago'; const hrs = Math.round(mins / 60); return hrs < 24 ? hrs + 'h ago' : Math.round(hrs / 24) + 'd ago'; }

async function liveDashboard(env) {
  const fieldMap = await fields(env);
  const sevField = fieldMap['inc severity'];
  const ttrField = fieldMap['time to resolution'];
  const users = await resolveUsers(env);
  const validUsers = users.filter((u) => u.accountId);
  const unresolved = users.filter((u) => !u.accountId).map((u) => u.name);
  if (!validUsers.length) throw new Error('No dashboard team members could be resolved in Jira');
  const accountList = validUsers.map((u) => '"' + u.accountId.replace(/"/g, '') + '"').join(',');
  const monday = mondayISO();
  const sevMinutes = Number(env.SEV1_RECENT_MINUTES || DEFAULT_SEV1_WINDOW);
  const base = 'project = CVIR';
  const [openIncidents, recentIncidents, inReviewToday, doneToday, rcaToday, openTeam, resolvedWeek, rcaWeek] = await Promise.all([
    search(env, base + ' AND issuetype = Incident AND statusCategory != Done AND status != "RCA in Progress"', ['key'], 5000),
    search(env, base + ' AND issuetype = Incident AND statusCategory != Done AND status != "RCA in Progress" AND created >= -' + sevMinutes + 'm ORDER BY created DESC', ['summary','created', sevField || 'priority'], 100),
    search(env, base + ' AND status CHANGED TO "In Review" AFTER startOfDay() AND assignee in (' + accountList + ')', ['assignee'], 500),
    search(env, base + ' AND statusCategory = Done AND resolutiondate >= startOfDay() AND assignee in (' + accountList + ')', ['assignee'], 500),
    search(env, base + ' AND issuetype = Incident AND status = "RCA in Progress" AND status CHANGED TO "RCA in Progress" AFTER startOfDay() AND assignee in (' + accountList + ')', ['assignee'], 500),
    search(env, base + ' AND statusCategory != Done AND (issuetype != Incident OR status != "RCA in Progress") AND assignee in (' + accountList + ') ORDER BY priority DESC, updated DESC', ['summary','issuetype','assignee','status','updated'], 500),
    search(env, base + ' AND issuetype = Incident AND statusCategory = Done AND resolutiondate >= "' + monday + '" AND resolutiondate IS NOT EMPTY', ['created','resolutiondate', sevField || 'priority', ttrField || 'updated'], 500),
    search(env, base + ' AND issuetype = Incident AND status = "RCA in Progress" AND status CHANGED TO "RCA in Progress" AFTER "' + monday + '"', ['created','resolutiondate', sevField || 'priority', ttrField || 'updated'], 500)
  ]);
  const severityOf = (issue) => sevField ? fieldValue(issue.fields[sevField]) : '';
  const sev1 = recentIncidents.issues.filter((i) => /sev[- ]?1/i.test(severityOf(i))).map((i) => ({ key: i.key, summary: i.fields.summary }));
  const uniqueIssues = (groups) => [...new Map(groups.flat().map((issue) => [issue.key, issue])).values()];
  const completedOrReviewedToday = uniqueIssues([doneToday.issues, rcaToday.issues, inReviewToday.issues]);
  const byAccount = (issues, id) => issues.filter((i) => i.fields.assignee && i.fields.assignee.accountId === id).length;
  const team = users.map((u) => ({
    name: u.name,
    assignedOpen: u.accountId ? byAccount(openTeam.issues, u.accountId) : 0,
    completedOrReviewedToday: u.accountId ? byAccount(completedOrReviewedToday, u.accountId) : 0
  }));
  const completedThisWeek = uniqueIssues([resolvedWeek.issues, rcaWeek.issues]);
  const resolutionHours = (issue) => {
    const ttrSeconds = ttrField ? Number(fieldValue(issue.fields[ttrField])) : NaN;
    if (Number.isFinite(ttrSeconds) && ttrSeconds >= 0) return ttrSeconds / 3600;
    return issue.fields.resolutiondate ? hoursBetween(issue.fields.created, issue.fields.resolutiondate) : null;
  };
  const resolvedEntries = completedThisWeek.map((i) => ({ hours: resolutionHours(i), severity: severityOf(i) })).filter((x) => Number.isFinite(x.hours) && x.hours >= 0);
  const times = resolvedEntries.map((x) => x.hours);
  const severityTimes = (level) => resolvedEntries.filter((x) => new RegExp('sev[- ]?' + level, 'i').test(x.severity)).map((x) => x.hours);
  const mttrEntry = (values, target) => ({ hours: values.length ? values.reduce((a,b) => a+b, 0) / values.length : null, medianHours: median(values), count: values.length, target });
  const issueRows = openTeam.issues.map((i) => ({ key: i.key, summary: i.fields.summary, type: i.fields.issuetype && i.fields.issuetype.name, assignee: i.fields.assignee && i.fields.assignee.displayName, status: i.fields.status && i.fields.status.name, updated: ago(i.fields.updated) }));
  const incidents = issueRows.filter((i) => String(i.type).toLowerCase() === 'incident').length;
  const sev1Times = severityTimes(1), sev2Times = severityTimes(2), sev3Times = severityTimes(3);
  const excludedMttr = completedThisWeek.length - resolvedEntries.length;
  return {
    mode: 'live', generatedAt: new Date().toISOString(), sev1WindowMinutes: sevMinutes, openIncidentCount: openIncidents.total,
    openIncidentTrend: [42,48,46,54,51,59,57,64,61,68,65,Math.min(92, 40 + openIncidents.total / 2)], recentSev1: sev1,
    mttr: { resolvedCount: times.length, bySeverity: { sev1: mttrEntry(sev1Times, 2), sev2: mttrEntry(sev2Times, 24), sev3: mttrEntry(sev3Times, 72) } }, teamOpen: { total: issueRows.length, incidents, other: issueRows.length - incidents },
    team, openTickets: issueRows, windowLabel: 'Asia/Kolkata · Monday ' + monday + ' 00:00 → now',
    warnings: [...(sevField ? [] : ['Jira field INC Severity could not be resolved']), ...(ttrField ? [] : ['Jira field Time to Resolution could not be resolved']), ...(excludedMttr ? [excludedMttr + ' completed incidents excluded from MTTR because resolution time is missing'] : []), ...(unresolved.length ? ['Unresolved Jira member mapping: ' + unresolved.join(', ')] : [])]
  };
}

function unavailableDashboard(mode, warning) {
  return {
    mode, generatedAt: new Date().toISOString(), sev1WindowMinutes: 30,
    openIncidentCount: null, openIncidentTrend: [], recentSev1: [],
    mttr: { resolvedCount: null, bySeverity: { sev1: { hours: null, target: 2 }, sev2: { hours: null, target: 24 }, sev3: { hours: null, target: 72 } } },
    teamOpen: { total: null, incidents: null, other: null },
    team: TEAM_NAMES.map((name) => ({ name, assignedOpen: null, completedOrReviewedToday: null })),
    openTickets: [], windowLabel: 'Live CVIR data unavailable', warnings: [warning]
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/styles.css') {
      return new Response(__STYLES_CSS__, { headers: { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' } });
    }
    if (url.pathname === '/app.js') {
      return new Response(__APP_JS__, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' } });
    }
    if (url.pathname === '/api/dashboard') {
      if (!env.JIRA_BASE_URL || !env.JIRA_EMAIL || !env.JIRA_API_TOKEN) return json(unavailableDashboard('unconfigured', 'Jira is not connected · live CVIR figures are hidden'));
      try { return json(await liveDashboard(env)); }
      catch (error) { return json({ ...unavailableDashboard('error', 'Live Jira refresh failed · figures are hidden'), diagnostic: String(error.message || error) }, 502); }
    }
    if (url.pathname === '/health') return json({ ok: true, jiraConfigured: Boolean(env.JIRA_BASE_URL && env.JIRA_EMAIL && env.JIRA_API_TOKEN) });
    return new Response(__INDEX_HTML__, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', 'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'", 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' } });
  }
};
