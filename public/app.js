(function () {
  'use strict';

  var REFRESH_SECONDS = 300;
  var BOARD_ROTATE_SECONDS = 30;
  var RESOURCE_SCROLL_INTERVAL = 40;
  var RESOURCE_SCROLL_PAUSE = 2200;
  var SEEN_SEV1_STORAGE = 'cvir-seen-sev1-keys-v1';
  var state = { countdown: REFRESH_SECONDS, boardCountdown: BOARD_ROTATE_SECONDS, alignments: [], resourceAvailable: true, resourceScrollDirection: 1, resourceScrollPauseUntil: 0, resourceScrollPaused: false, data: null, busy: false, logoTimer: null };
  var audioContext = null;
  var alarmTimer = null;
  var alarmAutoCloseTimer = null;
  var resourceScrollTimer = null;
  var apiMeta = document.querySelector('meta[name="cvir-api-base"]');
  var apiBase = apiMeta && apiMeta.content ? apiMeta.content.replace(/\/$/, '') : '';
  var mesBoardUrl = (apiBase || '') + '/mes';

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
    var header = '<div class="team-header" role="row"><span role="columnheader">Owner</span><span role="columnheader">Assigned open</span><span role="columnheader">Pending incident</span><span role="columnheader">Closed / In Review today</span><span role="columnheader">RCA</span></div>';
    $('teamTable').innerHTML = header + team.map(function (member) {
      return '<div class="team-row" role="row"><span class="person" role="cell"><i class="avatar">' + esc(initials(member.name)) + '</i><span class="person-name">' + esc(member.name) + '</span></span><span class="metric-cell open" role="cell">' + metric(member.assignedOpen) + '</span><span class="metric-cell pending" role="cell">' + metric(member.pendingIncidents) + '</span><span class="metric-cell closed" role="cell">' + metric(member.completedOrReviewedToday) + '</span><span class="metric-cell rca" role="cell">' + metric(member.rcaInProgress) + '</span></div>';
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
    $('resourceRange').textContent = items.length + (items.length === 1 ? ' activity' : ' activities') + ' · auto-scroll';
    $('resourcePagerDots').innerHTML = '<i class="active"></i>';
    $('resourceList').innerHTML = items.map(function (item, index) {
      var badgeClass = String(item.activityType || 'Other').toLowerCase();
      var meta = [];
      if (item.schedule) meta.push('<span>' + esc(item.schedule) + '</span>');
      if (item.notes) meta.push('<span>' + esc(item.notes) + '</span>');
      return '<div class="alignment-row" style="animation-delay:' + (index * 40) + 'ms"><span class="alignment-badge ' + esc(badgeClass) + '">' + esc(item.activityType || 'Other') + '</span><span class="alignment-copy"><span class="alignment-title">' + esc(item.title) + '</span><span class="alignment-resources">' + esc(item.resources) + '</span>' + (meta.length ? '<span class="alignment-meta">' + meta.join('') + '</span>' : '') + '</span></div>';
    }).join('');
    var list = $('resourceList');
    list.scrollTop = 0;
    state.resourceScrollDirection = 1;
    state.resourceScrollPauseUntil = Date.now() + RESOURCE_SCROLL_PAUSE;
  }
  function renderEmployeeOfMonth(data) {
    var enabled = Boolean(data && data.enabled && data.employee && data.employee.name);
    var card = $('employeeMonthCard');
    card.hidden = !enabled;
    $('sideRail').classList.toggle('has-employee', enabled);
    if (!enabled) return;
    var employee = data.employee;
    var name = String(employee.name || '');
    var recognition = String(employee.recognition || '');
    var imageUrl = String(employee.imageUrl || '');
    $('employeeMonthName').textContent = name;
    $('employeeMonthInitials').textContent = initials(name);
    $('employeeMonthRecognition').textContent = recognition;
    $('employeeMonthRecognition').hidden = !recognition;
    $('employeeMonthImage').hidden = true;
    $('employeeMonthInitials').hidden = false;
    if (imageUrl) $('employeeMonthImage').src = imageUrl;
  }
  function startResourceAutoScroll() {
    if (resourceScrollTimer) clearInterval(resourceScrollTimer);
    resourceScrollTimer = setInterval(function () {
      var list = $('resourceList');
      if (!list || state.resourceScrollPaused || Date.now() < state.resourceScrollPauseUntil) return;
      var maximum = list.scrollHeight - list.clientHeight;
      if (maximum <= 1) return;
      list.scrollTop += state.resourceScrollDirection;
      if (list.scrollTop >= maximum - 1) {
        list.scrollTop = maximum;
        state.resourceScrollDirection = -1;
        state.resourceScrollPauseUntil = Date.now() + RESOURCE_SCROLL_PAUSE;
      } else if (list.scrollTop <= 1) {
        list.scrollTop = 0;
        state.resourceScrollDirection = 1;
        state.resourceScrollPauseUntil = Date.now() + RESOURCE_SCROLL_PAUSE;
      }
    }, RESOURCE_SCROLL_INTERVAL);
  }
  function fetchResourceAlignments() {
    return fetch(apiBase + '/api/resource-alignments', { cache: 'no-store', headers: { 'Accept': 'application/json' } })
      .then(function (response) { if (!response.ok) throw new Error('Resource service returned ' + response.status); return response.json(); })
      .then(function (data) { state.alignments = Array.isArray(data.items) ? data.items : []; state.resourceAvailable = true; renderResourceAlignments(); })
      .catch(function () { state.alignments = []; state.resourceAvailable = false; renderResourceAlignments(); });
  }
  function fetchEmployeeOfMonth() {
    return fetch(apiBase + '/api/employee-of-month', { cache: 'no-store', headers: { 'Accept': 'application/json' } })
      .then(function (response) { if (!response.ok) throw new Error('Employee spotlight service returned ' + response.status); return response.json(); })
      .then(renderEmployeeOfMonth)
      .catch(function () { renderEmployeeOfMonth({ enabled: false, employee: null }); });
  }
  function render(data) {
    state.data = data;
    var openSev1 = Array.isArray(data.openSev1) ? data.openSev1 : [];
    $('openIncidents').textContent = data.openIncidentCount == null ? '—' : data.openIncidentCount;
    drawSpark(data.openIncidentTrend || []);
    $('sevCount').textContent = data.mode === 'live' ? openSev1.length : '—';
    $('sevWindow').textContent = 'excludes Done / RCA';
    $('sevCard').classList.toggle('alert', openSev1.length > 0);
    $('sevMessage').textContent = data.mode !== 'live' ? 'Waiting for live Jira data' : (openSev1.length ? (openSev1[0].key + ' · ' + openSev1[0].summary) : 'No open critical incidents');
    renderMttrGroup('operational', data.mttr.operational);
    renderMttrGroup('drishti', data.mttr.drishti);
    $('mttrResolvedLabel').textContent = data.mttr.resolvedCount == null ? 'Live data required' : data.mttr.resolvedCount + ' created + completed · ' + (data.mttr.periodLabel || 'month to date');
    $('teamOpenTotal').textContent = data.teamOpen.total == null ? '—' : data.teamOpen.total;
    $('teamIncidentTotal').textContent = data.teamOpen.incidents == null ? '—' : data.teamOpen.incidents;
    $('teamOtherTotal').textContent = data.teamOpen.other == null ? '—' : data.teamOpen.other;
    var monthCreated = data.monthCreated || { total: null, incidents: null, other: null, periodLabel: 'Month to date' };
    $('monthCreatedTotal').textContent = monthCreated.total == null ? '—' : monthCreated.total;
    $('monthCreatedIncidentTotal').textContent = monthCreated.incidents == null ? '—' : monthCreated.incidents;
    $('monthCreatedOtherTotal').textContent = monthCreated.other == null ? '—' : monthCreated.other;
    $('monthCreatedLabel').textContent = monthCreated.periodLabel || 'Month to date';
    renderTeam(data.team);
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
    if (state.logoTimer) clearTimeout(state.logoTimer);
    $('kimbalRefreshLogo').classList.remove('is-refreshing');
    void $('kimbalRefreshLogo').offsetWidth;
    $('kimbalRefreshLogo').classList.add('is-refreshing');
    var alignmentsRequest = fetchResourceAlignments();
    var employeeRequest = fetchEmployeeOfMonth();
    var dashboardRequest = fetch(apiBase + '/api/dashboard', { cache: 'no-store', headers: { 'Accept': 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('Dashboard service returned ' + r.status); return r.json(); })
      .then(function (data) { render(data); handleNewSev1(data); state.countdown = REFRESH_SECONDS; if (manual) toast(data.mode === 'live' ? 'Live Jira data refreshed' : 'Live Jira data unavailable'); })
      .catch(function () { render(window.CVIR_UNAVAILABLE_DATA); state.countdown = REFRESH_SECONDS; if (manual) toast('Dashboard service unavailable'); });
    Promise.all([alignmentsRequest, employeeRequest, dashboardRequest]).then(function () {
      state.busy = false; $('refreshButton').classList.remove('loading');
      state.logoTimer = setTimeout(function () { $('kimbalRefreshLogo').classList.remove('is-refreshing'); state.logoTimer = null; }, 1300);
    });
  }
  window.CVIR_UNAVAILABLE_DATA = {
    mode: 'error', generatedAt: new Date().toISOString(), sev1WindowMinutes: 30, openIncidentCount: null,
    openIncidentTrend: [], openSev1: [], recentSev1: [], mttr: { resolvedCount: null, periodLabel: 'Month to date', operational: { resolvedCount: null, bySeverity: { sev1: {hours:null}, sev2: {hours:null}, sev3: {hours:null} } }, drishti: { resolvedCount: null, bySeverity: { sev1: {hours:null}, sev2: {hours:null}, sev3: {hours:null} } } },
    teamOpen: { total: null, incidents: null, other: null, periodLabel: 'Selected statuses · all dates' }, monthCreated: { total: null, incidents: null, other: null, periodLabel: 'Current month · created' }, team: ['Darshita','Heena','Yashy','Shreya','Parveen','Anshul','Nikhil','Rahul Sethi','Shiva Sharma'].map(function (name) { return {name:name,assignedOpen:null,pendingIncidents:null,completedOrReviewedToday:null,rcaInProgress:null}; }),
    openTickets: [], rcaTickets: [], windowLabel: 'Live CVIR data unavailable', warnings: ['Dashboard service unavailable · figures are hidden']
  };
  $('sevAlertAcknowledge').addEventListener('click', stopSev1Alarm);
  document.addEventListener('keydown', function (event) { var context = getAudioContext(); if (context && context.state === 'suspended') context.resume().catch(function () {}); if (event.key === 'Escape' && !$('sevAlertOverlay').hidden) stopSev1Alarm(); });
  document.addEventListener('pointerdown', function () { var context = getAudioContext(); if (context && context.state === 'suspended') context.resume().catch(function () {}); }, { once: true });
  $('refreshButton').addEventListener('click', function () { fetchData(true); });
  $('boardSwitch').href = mesBoardUrl;
  setInterval(function () {
    state.countdown -= 1;
    if (state.countdown <= 0) fetchData(false);
    var m = Math.floor(state.countdown / 60);
    var s = state.countdown % 60;
    $('countdown').textContent = m + ':' + (s < 10 ? '0' : '') + s;
    if ($('sevAlertOverlay').hidden) state.boardCountdown -= 1;
    $('boardCountdown').textContent = Math.max(0, state.boardCountdown) + 's';
    if (state.boardCountdown <= 0 && $('sevAlertOverlay').hidden) window.location.replace(mesBoardUrl);
  }, 1000);
  $('resourceList').addEventListener('pointerenter', function () { state.resourceScrollPaused = true; });
  $('resourceList').addEventListener('pointerleave', function () { state.resourceScrollPaused = false; state.resourceScrollPauseUntil = Date.now() + 900; });
  $('resourceList').addEventListener('focusin', function () { state.resourceScrollPaused = true; });
  $('resourceList').addEventListener('focusout', function () { state.resourceScrollPaused = false; state.resourceScrollPauseUntil = Date.now() + 900; });
  $('employeeMonthImage').addEventListener('load', function () { this.hidden = false; $('employeeMonthInitials').hidden = true; });
  $('employeeMonthImage').addEventListener('error', function () { this.hidden = true; $('employeeMonthInitials').hidden = false; });
  startResourceAutoScroll();
  clock(); setInterval(clock, 1000); fetchData(false);
}());
