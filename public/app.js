(function () {
  'use strict';

  var REFRESH_SECONDS = 300;
  var PAGE_SIZE = 6;
  var RESOURCE_PAGE_SIZE = 5;
  var ROTATE_SECONDS = 12;
  var SEEN_SEV1_STORAGE = 'cvir-seen-sev1-keys-v1';
  var state = { countdown: REFRESH_SECONDS, page: 0, rcaPage: 0, queueMode: 'open', resourcePage: 0, tickets: [], rcaTickets: [], alignments: [], resourceAvailable: true, data: null, busy: false };
  var audioContext = null;
  var alarmTimer = null;
  var alarmAutoCloseTimer = null;
  var apiMeta = document.querySelector('meta[name="cvir-api-base"]');
  var apiBase = apiMeta && apiMeta.content ? apiMeta.content.replace(/\/$/, '') : '';

  var $ = function (id) { return document.getElementById(id); };
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]; }); }
  function initials(name) { return String(name || '?').split(/\s+/).map(function (x) { return x.charAt(0); }).join('').slice(0, 2).toUpperCase(); }
  function formatDuration(hours) { if (hours == null) return '—'; return hours < 1 ? Math.round(hours * 60) + 'm' : hours.toFixed(hours < 10 ? 1 : 0) + 'h'; }
  function clock() {
    var now = new Date();
    $('clock').textContent = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(now);
    $('date').textContent = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' }).format(now);
  }
  function toast(message) { var el = $('toast'); el.textContent = message; el.classList.add('show'); setTimeout(function () { el.classList.remove('show'); }, 2600); }
  function seenSev1Keys() {
    try { var stored = JSON.parse(localStorage.getItem(SEEN_SEV1_STORAGE) || '[]'); return Array.isArray(stored) ? stored : []; }
    catch (_) { return []; }
  }
  function saveSeenSev1Keys(keys) {
    try { localStorage.setItem(SEEN_SEV1_STORAGE, JSON.stringify(keys.slice(-100))); } catch (_) {}
  }
  function getAudioContext() {
    if (audioContext) return audioContext;
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    try { audioContext = new AudioContext(); } catch (_) { audioContext = null; }
    return audioContext;
  }
  function alarmBurst() {
    var context = getAudioContext();
    if (!context) return Promise.resolve(false);
    function play() {
      var now = context.currentTime;
      [0, .34, .68].forEach(function (offset, index) {
        var oscillator = context.createOscillator();
        var gain = context.createGain();
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(index % 2 ? 660 : 880, now + offset);
        gain.gain.setValueAtTime(.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(.22, now + offset + .03);
        gain.gain.exponentialRampToValueAtTime(.0001, now + offset + .24);
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.start(now + offset); oscillator.stop(now + offset + .26);
      });
      return true;
    }
    if (context.state === 'suspended') return context.resume().then(play).catch(function () { return false; });
    try { return Promise.resolve(play()); } catch (_) { return Promise.resolve(false); }
  }
  function stopSev1Alarm() {
    if (alarmTimer) { clearInterval(alarmTimer); alarmTimer = null; }
    if (alarmAutoCloseTimer) { clearTimeout(alarmAutoCloseTimer); alarmAutoCloseTimer = null; }
    $('sevAlertOverlay').hidden = true;
  }
  function startSev1Alarm() {
    if (alarmTimer) clearInterval(alarmTimer);
    alarmBurst().then(function (played) {
      $('sevAlertNote').textContent = played ? 'Alarm ringing · closes automatically in 10 seconds' : 'Sound blocked · visual alert closes automatically in 10 seconds';
    });
    alarmTimer = setInterval(alarmBurst, 3600);
  }
  function showSev1Alert(incidents) {
    var first = incidents[0];
    $('sevAlertKey').textContent = incidents.length > 1 ? incidents.length + ' new SEV-1 incidents' : first.key;
    $('sevAlertSummary').textContent = incidents.length > 1 ? first.key + ' · ' + first.summary + ' · plus ' + (incidents.length - 1) + ' more' : first.summary;
    $('sevAlertOverlay').hidden = false;
    startSev1Alarm();
    if (alarmAutoCloseTimer) clearTimeout(alarmAutoCloseTimer);
    alarmAutoCloseTimer = setTimeout(stopSev1Alarm, 10000);
    setTimeout(function () { $('sevAlertAcknowledge').focus(); }, 0);
  }
  function handleNewSev1(data) {
    if (!data || data.mode !== 'live' || !Array.isArray(data.recentSev1)) return;
    var seen = seenSev1Keys();
    var newIncidents = data.recentSev1.filter(function (incident) { return incident && incident.key && seen.indexOf(incident.key) === -1; });
    if (!newIncidents.length) return;
    saveSeenSev1Keys(seen.concat(newIncidents.map(function (incident) { return incident.key; })));
    showSev1Alert(newIncidents);
  }
  function drawSpark(values) { $('incidentSpark').innerHTML = values.map(function (v) { return '<i style="height:' + Math.max(16, Math.min(100, v)) + '%"></i>'; }).join(''); }
  function renderMttrLane(group, number, entry, target) {
    var hours = entry && entry.hours;
    $(group + 'MttrSev' + number).textContent = hours == null ? '—' : formatDuration(hours);
    var ratio = hours == null ? 0 : hours / target;
    $(group + 'MttrBar' + number).style.width = Math.min(100, Math.max(hours == null ? 0 : 5, ratio * 100)) + '%';
    $(group + 'MttrLane' + number).classList.toggle('breach', hours != null && hours > target);
  }
  function renderMttrGroup(group, data) {
    var value = data || { resolvedCount: null, bySeverity: {} };
    renderMttrLane(group, 1, value.bySeverity.sev1, 2);
    renderMttrLane(group, 2, value.bySeverity.sev2, 24);
    renderMttrLane(group, 3, value.bySeverity.sev3, 72);
    $(group + 'MttrCount').textContent = value.resolvedCount == null ? '— incidents' : value.resolvedCount + ' incidents';
  }
  function renderTeam(team) {
    function metric(value) { return value == null ? '—' : value; }
    var header = '<div class="team-header" role="row"><span role="columnheader">Owner</span><span role="columnheader">Assigned open</span><span role="columnheader">Closed / In Review today</span><span role="columnheader">RCA</span></div>';
    $('teamTable').innerHTML = header + team.map(function (member) {
      return '<div class="team-row" role="row"><span class="person" role="cell"><i class="avatar">' + esc(initials(member.name)) + '</i><span class="person-name">' + esc(member.name) + '</span></span><span class="metric-cell open" role="cell">' + metric(member.assignedOpen) + '</span><span class="metric-cell closed" role="cell">' + metric(member.completedOrReviewedToday) + '</span><span class="metric-cell rca" role="cell">' + metric(member.rcaInProgress) + '</span></div>';
    }).join('');
  }
  function renderQueue() {
    var showingRca = state.queueMode === 'rca';
    var tickets = showingRca ? state.rcaTickets : state.tickets;
    var currentPage = showingRca ? state.rcaPage : state.page;
    $('queueEyebrow').textContent = showingRca ? 'Incident follow-up' : 'Assigned workload';
    $('queueTitle').textContent = showingRca ? 'RCA in progress' : 'Open ticket queue';
    document.querySelector('.queue-card').classList.toggle('showing-rca', showingRca);
    if (!tickets.length) {
      var liveMessage = showingRca ? 'No RCA-in-progress incidents match the selected team.' : 'No open tickets assigned to the selected team.';
      var message = state.data && state.data.mode !== 'live' ? 'Live Jira connection required to load assignments.' : liveMessage;
      $('ticketList').innerHTML = '<div class="empty-state">' + message + '</div>';
      $('queueRange').textContent = state.data && state.data.mode !== 'live' ? 'Unavailable' : '0 tickets';
      $('pagerDots').innerHTML = '';
      return;
    }
    var pages = Math.ceil(tickets.length / PAGE_SIZE);
    if (currentPage >= pages) currentPage = 0;
    if (showingRca) state.rcaPage = currentPage; else state.page = currentPage;
    var start = currentPage * PAGE_SIZE;
    var slice = tickets.slice(start, start + PAGE_SIZE);
    $('queueRange').textContent = (start + 1) + '–' + Math.min(start + PAGE_SIZE, tickets.length) + ' of ' + tickets.length;
    $('pagerDots').innerHTML = Array.apply(null, Array(Math.min(pages, 8))).map(function (_, i) { return '<i class="' + (i === currentPage ? 'active' : '') + '"></i>'; }).join('');
    $('ticketList').innerHTML = slice.map(function (ticket, index) {
      if (showingRca) {
        var ownership = [];
        if (ticket.assigneeMembers && ticket.assigneeMembers.length) ownership.push('Assigned: ' + ticket.assigneeMembers.join(', '));
        if (ticket.l2Members && ticket.l2Members.length) ownership.push('L2: ' + ticket.l2Members.join(', '));
        if (!ownership.length && ticket.matchedMembers) ownership.push(ticket.matchedMembers.join(', '));
        return '<div class="ticket-row rca-row" style="animation-delay:' + (index * 35) + 'ms"><span class="ticket-key"><i class="type-icon incident">!</i>' + esc(ticket.key) + '</span><span class="ticket-copy"><span class="ticket-title">' + esc(ticket.summary) + '</span><span class="ticket-updated">Updated ' + esc(ticket.updated) + (ticket.assignee ? ' · Jira assignee ' + esc(ticket.assignee) : '') + '</span></span><span class="owner-chip rca-owner">' + esc(ownership.join(' · ')) + '</span><span class="status-chip rca-status">RCA</span></div>';
      }
      var isIncident = String(ticket.type).toLowerCase() === 'incident';
      return '<div class="ticket-row" style="animation-delay:' + (index * 35) + 'ms"><span class="ticket-key"><i class="type-icon ' + (isIncident ? 'incident' : '') + '">' + (isIncident ? '!' : '◆') + '</i>' + esc(ticket.key) + '</span><span class="ticket-copy"><span class="ticket-title">' + esc(ticket.summary) + '</span><span class="ticket-updated">Updated ' + esc(ticket.updated) + '</span></span><span class="owner-chip">' + esc(ticket.assignee) + '</span><span class="status-chip">' + esc(ticket.status) + '</span></div>';
    }).join('');
  }
  function renderResourceAlignments() {
    var items = state.alignments;
    if (!items.length) {
      $('resourceList').innerHTML = '<div class="empty-state">' + (state.resourceAvailable ? 'No resource alignment has been added yet.' : 'Resource alignment is temporarily unavailable.') + '</div>';
      $('resourceRange').textContent = state.resourceAvailable ? '0 activities' : 'Unavailable';
      $('resourcePagerDots').innerHTML = '';
      return;
    }
    var pages = Math.ceil(items.length / RESOURCE_PAGE_SIZE);
    if (state.resourcePage >= pages) state.resourcePage = 0;
    var start = state.resourcePage * RESOURCE_PAGE_SIZE;
    var slice = items.slice(start, start + RESOURCE_PAGE_SIZE);
    $('resourceRange').textContent = (start + 1) + '–' + Math.min(start + RESOURCE_PAGE_SIZE, items.length) + ' of ' + items.length;
    $('resourcePagerDots').innerHTML = Array.apply(null, Array(Math.min(pages, 8))).map(function (_, index) { return '<i class="' + (index === state.resourcePage ? 'active' : '') + '"></i>'; }).join('');
    $('resourceList').innerHTML = slice.map(function (item, index) {
      var badgeClass = String(item.activityType || 'Other').toLowerCase();
      var meta = [];
      if (item.schedule) meta.push('<span>' + esc(item.schedule) + '</span>');
      if (item.notes) meta.push('<span>' + esc(item.notes) + '</span>');
      return '<div class="alignment-row" style="animation-delay:' + (index * 40) + 'ms"><span class="alignment-badge ' + esc(badgeClass) + '">' + esc(item.activityType || 'Other') + '</span><span class="alignment-copy"><span class="alignment-title">' + esc(item.title) + '</span><span class="alignment-resources">' + esc(item.resources) + '</span>' + (meta.length ? '<span class="alignment-meta">' + meta.join('') + '</span>' : '') + '</span></div>';
    }).join('');
  }
  function fetchResourceAlignments() {
    return fetch(apiBase + '/api/resource-alignments', { cache: 'no-store', headers: { 'Accept': 'application/json' } })
      .then(function (response) { if (!response.ok) throw new Error('Resource service returned ' + response.status); return response.json(); })
      .then(function (data) { state.alignments = Array.isArray(data.items) ? data.items : []; state.resourcePage = 0; state.resourceAvailable = true; renderResourceAlignments(); })
      .catch(function () { state.alignments = []; state.resourcePage = 0; state.resourceAvailable = false; renderResourceAlignments(); });
  }
  function render(data) {
    state.data = data; state.tickets = data.openTickets || []; state.rcaTickets = data.rcaTickets || []; state.page = 0; state.rcaPage = 0; state.queueMode = 'open';
    $('openIncidents').textContent = data.openIncidentCount == null ? '—' : data.openIncidentCount;
    drawSpark(data.openIncidentTrend || []);
    $('sevCount').textContent = data.mode === 'live' ? data.recentSev1.length : '—';
    $('sevWindow').textContent = 'last ' + data.sev1WindowMinutes + ' min';
    $('sevCard').classList.toggle('alert', data.recentSev1.length > 0);
    $('sevMessage').textContent = data.mode !== 'live' ? 'Waiting for live Jira data' : (data.recentSev1.length ? (data.recentSev1[0].key + ' · ' + data.recentSev1[0].summary) : 'No new critical incidents');
    renderMttrGroup('operational', data.mttr.operational);
    renderMttrGroup('drishti', data.mttr.drishti);
    $('mttrResolvedLabel').textContent = data.mttr.resolvedCount == null ? 'Live data required' : data.mttr.resolvedCount + ' resolved · Mon → now';
    $('teamOpenTotal').textContent = data.teamOpen.total == null ? '—' : data.teamOpen.total;
    $('teamIncidentTotal').textContent = data.teamOpen.incidents == null ? '—' : data.teamOpen.incidents;
    $('teamOtherTotal').textContent = data.teamOpen.other == null ? '—' : data.teamOpen.other;
    renderTeam(data.team);
    renderQueue();
    $('lastSync').textContent = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date(data.generatedAt));
    $('dataWindow').textContent = data.windowLabel;
    $('modePill').classList.toggle('live', data.mode === 'live');
    $('modePill').classList.toggle('error', data.mode !== 'live');
    $('modeText').textContent = data.mode === 'live' ? 'Jira live' : (data.mode === 'unconfigured' ? 'Jira not connected' : 'Jira unavailable');
    $('warningText').textContent = data.warnings && data.warnings.length ? data.warnings[0] : 'In Review / RCA in Progress excluded from open queue · read-only';
  }
  function fetchData(manual) {
    if (state.busy) return;
    state.busy = true; $('refreshButton').classList.add('loading');
    fetchResourceAlignments();
    fetch(apiBase + '/api/dashboard', { cache: 'no-store', headers: { 'Accept': 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('Dashboard service returned ' + r.status); return r.json(); })
      .then(function (data) { render(data); handleNewSev1(data); state.countdown = REFRESH_SECONDS; if (manual) toast(data.mode === 'live' ? 'Live Jira data refreshed' : 'Live Jira data unavailable'); })
      .catch(function () { render(window.CVIR_UNAVAILABLE_DATA); state.countdown = REFRESH_SECONDS; if (manual) toast('Dashboard service unavailable'); })
      .then(function () { state.busy = false; $('refreshButton').classList.remove('loading'); });
  }
  window.CVIR_UNAVAILABLE_DATA = {
    mode: 'error', generatedAt: new Date().toISOString(), sev1WindowMinutes: 30, openIncidentCount: null,
    openIncidentTrend: [], recentSev1: [], mttr: { resolvedCount: null, operational: { resolvedCount: null, bySeverity: { sev1: {hours:null}, sev2: {hours:null}, sev3: {hours:null} } }, drishti: { resolvedCount: null, bySeverity: { sev1: {hours:null}, sev2: {hours:null}, sev3: {hours:null} } } },
    teamOpen: { total: null, incidents: null, other: null }, team: ['Darshita','Heena','Yashy','Shreya','Parveen','Anshul','Nikhil','Rahul Sethi'].map(function (name) { return {name:name,assignedOpen:null,completedOrReviewedToday:null,rcaInProgress:null}; }),
    openTickets: [], rcaTickets: [], windowLabel: 'Live CVIR data unavailable', warnings: ['Dashboard service unavailable · figures are hidden']
  };
  $('sevAlertAcknowledge').addEventListener('click', stopSev1Alarm);
  document.addEventListener('keydown', function (event) { var context = getAudioContext(); if (context && context.state === 'suspended') context.resume().catch(function () {}); if (event.key === 'Escape' && !$('sevAlertOverlay').hidden) stopSev1Alarm(); });
  document.addEventListener('pointerdown', function () { var context = getAudioContext(); if (context && context.state === 'suspended') context.resume().catch(function () {}); }, { once: true });
  $('refreshButton').addEventListener('click', function () { fetchData(true); });
  setInterval(function () { state.countdown -= 1; if (state.countdown <= 0) fetchData(false); var m = Math.floor(state.countdown / 60); var s = state.countdown % 60; $('countdown').textContent = m + ':' + (s < 10 ? '0' : '') + s; }, 1000);
  setInterval(function () {
    var pages = Math.ceil(state.tickets.length / PAGE_SIZE);
    var rcaPages = Math.ceil(state.rcaTickets.length / PAGE_SIZE);
    var resourcePages = Math.ceil(state.alignments.length / RESOURCE_PAGE_SIZE);
    if (state.queueMode === 'open') {
      state.queueMode = 'rca';
    } else {
      state.queueMode = 'open';
      if (pages > 1) state.page = (state.page + 1) % pages;
      if (rcaPages > 1) state.rcaPage = (state.rcaPage + 1) % rcaPages;
    }
    renderQueue();
    if (resourcePages > 1) { state.resourcePage = (state.resourcePage + 1) % resourcePages; renderResourceAlignments(); }
  }, ROTATE_SECONDS * 1000);
  clock(); setInterval(clock, 1000); fetchData(false);
}());
