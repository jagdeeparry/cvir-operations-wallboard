const TEAM_NAMES = ['Darshita', 'Heena', 'Yashy', 'Shreya', 'Parveen', 'Anshul', 'Nikhil', 'Rahul Sethi'];
const DEFAULT_TEAM_ACCOUNT_IDS = { Darshita: '712020:c8cf55cc-36d0-41a2-936e-be1b0946dadf' };
const ACTIVE_ASSIGNED_STATUSES = '("In Progress", "in progress (L1)", "in progress (L3)", Open, "in progress (L2)")';
const DRISHTI_CREATOR = 'Arun Pandey';
const DEFAULT_SEV1_WINDOW = 30;
const RESOURCE_ACTIVITY_TYPES = ['SAT', 'FIIT', 'FAT', 'Other'];
let fieldCache = null;
let userCache = null;

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
function managerAuthorized(request, env) {
  const expected = String(env.RESOURCE_MANAGER_ACCESS_CODE || '');
  const actual = String(request.headers.get('x-manager-access-code') || '');
  if (!expected || expected.length !== actual.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) mismatch |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  return mismatch === 0;
}
function boundedText(value, maximum) {
  return String(value == null ? '' : value).trim().slice(0, maximum);
}
function alignmentDatabase(env) {
  if (!env.DB) throw new Error('Resource alignment database is not configured');
  return env.DB;
}
async function listResourceAlignments(env) {
  const result = await alignmentDatabase(env).prepare(
    'SELECT id, activity_type AS activityType, title, resources, schedule, notes, sort_order AS sortOrder, created_at AS createdAt FROM resource_alignments ORDER BY sort_order ASC, id ASC'
  ).all();
  return result.results || [];
}
async function resourceAlignmentResponse(request, env, url) {
  if (url.pathname === '/api/resource-alignments' && request.method === 'GET') {
    try { return json({ items: await listResourceAlignments(env) }); }
    catch (error) { return json({ items: [], error: String(error.message || error) }, 503); }
  }
  if (url.pathname === '/api/resource-alignments/auth' && request.method === 'GET') {
    return managerAuthorized(request, env) ? json({ ok: true }) : json({ error: 'Invalid manager access code' }, 401);
  }
  if (url.pathname === '/api/resource-alignments' && request.method === 'POST') {
    if (!managerAuthorized(request, env)) return json({ error: 'Invalid manager access code' }, 401);
    let body;
    try { body = await request.json(); }
    catch (_) { return json({ error: 'Request body must be valid JSON' }, 400); }
    const activityType = boundedText(body.activityType, 10);
    const title = boundedText(body.title, 120);
    const resources = boundedText(body.resources, 240);
    const schedule = boundedText(body.schedule, 120);
    const notes = boundedText(body.notes, 500);
    if (!RESOURCE_ACTIVITY_TYPES.includes(activityType)) return json({ error: 'Choose SAT, FIIT, FAT, or Other' }, 400);
    if (!title) return json({ error: 'Activity or customer is required' }, 400);
    if (!resources) return json({ error: 'At least one resource is required' }, 400);
    try {
      const result = await alignmentDatabase(env).prepare(
        'INSERT INTO resource_alignments (activity_type, title, resources, schedule, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(activityType, title, resources, schedule, notes, Date.now()).run();
      return json({ ok: true, id: result.meta && result.meta.last_row_id }, 201);
    } catch (error) { return json({ error: String(error.message || error) }, 503); }
  }
  const deleteMatch = url.pathname.match(/^\/api\/resource-alignments\/(\d+)$/);
  if (deleteMatch && request.method === 'DELETE') {
    if (!managerAuthorized(request, env)) return json({ error: 'Invalid manager access code' }, 401);
    try {
      await alignmentDatabase(env).prepare('DELETE FROM resource_alignments WHERE id = ?').bind(Number(deleteMatch[1])).run();
      return json({ ok: true });
    } catch (error) { return json({ error: String(error.message || error) }, 503); }
  }
  if (url.pathname.startsWith('/api/resource-alignments')) return json({ error: 'Method not allowed' }, 405);
  return null;
}
function authHeaders(env) {
  const base = String(env.JIRA_BASE_URL || '').toLowerCase();
  const authorization = base.startsWith('https://api.atlassian.com/ex/jira/')
    ? 'Bearer ' + env.JIRA_API_TOKEN
    : 'Basic ' + btoa(env.JIRA_EMAIL + ':' + env.JIRA_API_TOKEN);
  return { authorization, 'accept': 'application/json', 'content-type': 'application/json' };
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
export function durationSeconds(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const parsed = durationSeconds(value[index]);
      if (parsed != null) return parsed;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;

  for (const key of ['seconds', 'durationSeconds', 'elapsedSeconds', 'value']) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const parsed = durationSeconds(value[key]);
      if (parsed != null) return parsed;
    }
  }

  const elapsedMillis = Number(value.elapsedTime && value.elapsedTime.millis);
  if (Number.isFinite(elapsedMillis) && elapsedMillis >= 0) return elapsedMillis / 1000;

  if (Array.isArray(value.completedCycles)) {
    for (let index = value.completedCycles.length - 1; index >= 0; index -= 1) {
      const parsed = durationSeconds(value.completedCycles[index]);
      if (parsed != null) return parsed;
    }
  }

  if (value.ongoingCycle) {
    const parsed = durationSeconds(value.ongoingCycle);
    if (parsed != null) return parsed;
  }

  return null;
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
export function issueMatchesUser(value, user) {
  if (!value || !user) return false;
  if (Array.isArray(value)) return value.some((entry) => issueMatchesUser(entry, user));
  if (typeof value === 'object') {
    if (value.accountId && user.accountId && value.accountId === user.accountId) return true;
    return ['displayName', 'name', 'value'].some((key) => issueMatchesUser(value[key], user));
  }
  const candidate = normalize(value);
  if (!candidate) return false;
  return [user.name, user.displayName].filter(Boolean).some((name) => {
    const target = normalize(name);
    return target && (candidate === target || candidate.includes(target) || target.includes(candidate));
  });
}
async function resolveUsers(env) {
  if (userCache && userCache.expires > Date.now()) return userCache.value;
  let pinned = {};
  try { pinned = JSON.parse(env.JIRA_TEAM_ACCOUNT_IDS_JSON || '{}'); } catch (_) {}
  pinned = { ...DEFAULT_TEAM_ACCOUNT_IDS, ...pinned };
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
  const l2InvolvedField = fieldMap['l2 involved'];
  const users = await resolveUsers(env);
  const validUsers = users.filter((u) => u.accountId);
  const unresolved = users.filter((u) => !u.accountId).map((u) => u.name);
  if (!validUsers.length) throw new Error('No dashboard team members could be resolved in Jira');
  const accountList = validUsers.map((u) => '"' + u.accountId.replace(/"/g, '') + '"').join(',');
  const monday = mondayISO();
  const sevMinutes = Number(env.SEV1_RECENT_MINUTES || DEFAULT_SEV1_WINDOW);
  const base = 'project = CVIR';
  const rcaFields = ['summary','issuetype','assignee','status','updated'];
  if (l2InvolvedField) rcaFields.push(l2InvolvedField);
  const [openIncidents, recentIncidents, inReviewToday, doneToday, rcaToday, openTeam, resolvedWeek, rcaWeek, rcaTeamCandidates] = await Promise.all([
    search(env, base + ' AND issuetype = Incident AND statusCategory != Done AND status NOT IN ("In Review", "RCA in Progress")', ['key'], 5000),
    search(env, base + ' AND issuetype = Incident AND statusCategory != Done AND status != "RCA in Progress" AND created >= -' + sevMinutes + 'm ORDER BY created DESC', ['summary','created', sevField || 'priority'], 100),
    search(env, base + ' AND status CHANGED TO "In Review" AFTER startOfDay() AND assignee in (' + accountList + ')', ['assignee'], 500),
    search(env, base + ' AND statusCategory = Done AND resolutiondate >= startOfDay() AND assignee in (' + accountList + ')', ['assignee'], 500),
    search(env, base + ' AND issuetype = Incident AND status = "RCA in Progress" AND status CHANGED TO "RCA in Progress" AFTER startOfDay() AND assignee in (' + accountList + ')', ['assignee'], 500),
    search(env, base + ' AND assignee in (' + accountList + ') AND status IN ' + ACTIVE_ASSIGNED_STATUSES + ' ORDER BY created DESC', ['summary','issuetype','assignee','status','updated'], 5000),
    search(env, base + ' AND issuetype = Incident AND statusCategory = Done AND resolutiondate >= "' + monday + '" AND resolutiondate IS NOT EMPTY', ['created','creator','resolutiondate', sevField || 'priority', ttrField || 'updated'], 500),
    search(env, base + ' AND issuetype = Incident AND status = "RCA in Progress" AND status CHANGED TO "RCA in Progress" AFTER "' + monday + '"', ['created','creator','resolutiondate', sevField || 'priority', ttrField || 'updated'], 500),
    search(env, base + ' AND issuetype = Incident AND status = "RCA in Progress" ORDER BY updated DESC', rcaFields, 5000)
  ]);
  const severityOf = (issue) => sevField ? fieldValue(issue.fields[sevField]) : '';
  const sev1 = recentIncidents.issues.filter((i) => /sev[- ]?1/i.test(severityOf(i))).map((i) => ({ key: i.key, summary: i.fields.summary }));
  const uniqueIssues = (groups) => [...new Map(groups.flat().map((issue) => [issue.key, issue])).values()];
  const completedOrReviewedToday = uniqueIssues([doneToday.issues, rcaToday.issues, inReviewToday.issues]);
  const byAccount = (issues, id) => issues.filter((i) => i.fields.assignee && i.fields.assignee.accountId === id).length;
  const rcaMatchesFor = (issue, user) => {
    const assigneeMatch = issueMatchesUser(issue.fields.assignee, user);
    const l2Match = l2InvolvedField ? issueMatchesUser(issue.fields[l2InvolvedField], user) : false;
    return { assigneeMatch, l2Match, matched: assigneeMatch || l2Match };
  };
  const teamRcaIssues = rcaTeamCandidates.issues.filter((issue) => users.some((user) => rcaMatchesFor(issue, user).matched));
  const team = users.map((u) => ({
    name: u.name,
    assignedOpen: u.accountId ? byAccount(openTeam.issues, u.accountId) : 0,
    completedOrReviewedToday: u.accountId ? byAccount(completedOrReviewedToday, u.accountId) : 0,
    rcaInProgress: teamRcaIssues.filter((issue) => rcaMatchesFor(issue, u).matched).length
  }));
  const completedThisWeek = uniqueIssues([resolvedWeek.issues, rcaWeek.issues]);
  const resolutionHours = (issue) => {
    const ttrSeconds = ttrField ? durationSeconds(issue.fields[ttrField]) : null;
    if (ttrSeconds != null) return ttrSeconds / 3600;
    return issue.fields.resolutiondate ? hoursBetween(issue.fields.created, issue.fields.resolutiondate) : null;
  };
  const resolvedEntries = completedThisWeek.map((i) => ({ hours: resolutionHours(i), severity: severityOf(i), creator: fieldValue(i.fields.creator) })).filter((x) => Number.isFinite(x.hours) && x.hours >= 0);
  const times = resolvedEntries.map((x) => x.hours);
  const mttrEntry = (values, target) => ({ hours: values.length ? values.reduce((a,b) => a+b, 0) / values.length : null, medianHours: median(values), count: values.length, target });
  const mttrGroup = (entries) => {
    const severityTimes = (level) => entries.filter((x) => new RegExp('sev[- ]?' + level, 'i').test(x.severity)).map((x) => x.hours);
    return { resolvedCount: entries.length, bySeverity: { sev1: mttrEntry(severityTimes(1), 2), sev2: mttrEntry(severityTimes(2), 24), sev3: mttrEntry(severityTimes(3), 72) } };
  };
  const drishtiEntries = resolvedEntries.filter((x) => normalize(x.creator) === normalize(DRISHTI_CREATOR));
  const operationalEntries = resolvedEntries.filter((x) => normalize(x.creator) !== normalize(DRISHTI_CREATOR));
  const issueRows = openTeam.issues.map((i) => ({ key: i.key, summary: i.fields.summary, type: i.fields.issuetype && i.fields.issuetype.name, assignee: i.fields.assignee && i.fields.assignee.displayName, status: i.fields.status && i.fields.status.name, updated: ago(i.fields.updated) }));
  const rcaRows = teamRcaIssues.map((issue) => {
    const memberMatches = users.map((user) => ({ user, ...rcaMatchesFor(issue, user) })).filter((entry) => entry.matched);
    const assigneeMembers = memberMatches.filter((entry) => entry.assigneeMatch).map((entry) => entry.user.name);
    const l2Members = memberMatches.filter((entry) => entry.l2Match).map((entry) => entry.user.name);
    return {
      key: issue.key,
      summary: issue.fields.summary,
      assignee: issue.fields.assignee && issue.fields.assignee.displayName,
      matchedMembers: memberMatches.map((entry) => entry.user.name),
      assigneeMembers,
      l2Members,
      status: issue.fields.status && issue.fields.status.name,
      updated: ago(issue.fields.updated)
    };
  });
  const incidents = issueRows.filter((i) => String(i.type).toLowerCase() === 'incident').length;
  const excludedMttr = completedThisWeek.length - resolvedEntries.length;
  return {
    mode: 'live', generatedAt: new Date().toISOString(), sev1WindowMinutes: sevMinutes, openIncidentCount: openIncidents.total,
    openIncidentTrend: [42,48,46,54,51,59,57,64,61,68,65,Math.min(92, 40 + openIncidents.total / 2)], recentSev1: sev1,
    mttr: { resolvedCount: times.length, operational: mttrGroup(operationalEntries), drishti: mttrGroup(drishtiEntries) }, teamOpen: { total: issueRows.length, incidents, other: issueRows.length - incidents },
    team, openTickets: issueRows, rcaTickets: rcaRows, windowLabel: 'Asia/Kolkata · Monday ' + monday + ' 00:00 → now',
    warnings: [...(sevField ? [] : ['Jira field INC Severity could not be resolved']), ...(ttrField ? [] : ['Jira field Time to Resolution could not be resolved']), ...(l2InvolvedField ? [] : ['Jira field L2 Involved could not be resolved · RCA matching uses assignee only']), ...(excludedMttr ? [excludedMttr + ' completed incidents excluded from MTTR because resolution time is missing'] : []), ...(unresolved.length ? ['Unresolved Jira member mapping: ' + unresolved.join(', ')] : [])]
  };
}

function unavailableDashboard(mode, warning) {
  return {
    mode, generatedAt: new Date().toISOString(), sev1WindowMinutes: 30,
    openIncidentCount: null, openIncidentTrend: [], recentSev1: [],
    mttr: { resolvedCount: null, operational: { resolvedCount: null, bySeverity: { sev1: { hours: null, target: 2 }, sev2: { hours: null, target: 24 }, sev3: { hours: null, target: 72 } } }, drishti: { resolvedCount: null, bySeverity: { sev1: { hours: null, target: 2 }, sev2: { hours: null, target: 24 }, sev3: { hours: null, target: 72 } } } },
    teamOpen: { total: null, incidents: null, other: null },
    team: TEAM_NAMES.map((name) => ({ name, assignedOpen: null, completedOrReviewedToday: null, rcaInProgress: null })),
    openTickets: [], rcaTickets: [], windowLabel: 'Live CVIR data unavailable', warnings: [warning]
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const resourceResponse = await resourceAlignmentResponse(request, env, url);
    if (resourceResponse) return resourceResponse;
    if (url.pathname === '/styles.css') {
      return new Response(__STYLES_CSS__, { headers: { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' } });
    }
    if (url.pathname === '/app.js') {
      return new Response(__APP_JS__, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' } });
    }
    if (url.pathname === '/manage.css') {
      return new Response(__MANAGE_CSS__, { headers: { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' } });
    }
    if (url.pathname === '/manage.js') {
      return new Response(__MANAGE_JS__, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' } });
    }
    if (url.pathname === '/manage' || url.pathname === '/manage/') {
      return new Response(__MANAGE_HTML__, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', 'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'", 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' } });
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
