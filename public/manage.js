(function () {
  'use strict';
  var CODE_STORAGE = 'cvir-resource-manager-code';
  var managerCode = '';
  var $ = function (id) { return document.getElementById(id); };
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]; }); }
  function message(id, text, type) { var el = $(id); el.textContent = text || ''; el.className = 'message' + (type ? ' ' + type : ''); }
  function request(path, options) {
    var config = options || {};
    config.headers = Object.assign({ 'Accept': 'application/json', 'X-Manager-Access-Code': managerCode }, config.headers || {});
    return fetch(path, config).then(function (response) { return response.json().catch(function () { return {}; }).then(function (body) { if (!response.ok) throw new Error(body.error || 'Request failed'); return body; }); });
  }
  function render(items) {
    $('alignmentCount').textContent = items.length + (items.length === 1 ? ' item' : ' items');
    if (!items.length) { $('managerList').innerHTML = '<div class="empty">No resource alignments published.</div>'; return; }
    $('managerList').innerHTML = items.map(function (item) {
      return '<div class="manager-row"><span class="activity-badge">' + esc(item.activityType) + '</span><span class="row-title"><strong>' + esc(item.title) + '</strong><span>' + esc(item.notes || 'No additional notes') + '</span></span><span class="row-resources"><strong>' + esc(item.resources) + '</strong><span>Resources</span></span><span class="row-schedule">' + esc(item.schedule || 'Schedule not set') + '</span><button class="danger" type="button" data-delete-id="' + item.id + '">Remove</button></div>';
    }).join('');
  }
  function loadItems() { return request('/api/resource-alignments').then(function (body) { render(body.items || []); }); }
  function unlock(code) {
    managerCode = code;
    return request('/api/resource-alignments/auth').then(function () {
      sessionStorage.setItem(CODE_STORAGE, managerCode);
      $('loginPanel').hidden = true; $('managerWorkspace').hidden = false;
      return loadItems();
    });
  }
  $('loginForm').addEventListener('submit', function (event) {
    event.preventDefault(); message('loginMessage', 'Checking access…');
    unlock($('managerCode').value.trim()).then(function () { message('loginMessage', ''); }).catch(function () { managerCode = ''; message('loginMessage', 'Access code is incorrect.', 'error'); });
  });
  $('alignmentForm').addEventListener('submit', function (event) {
    event.preventDefault(); message('formMessage', 'Publishing…');
    var payload = { activityType:$('activityType').value, title:$('activityTitle').value.trim(), resources:$('resources').value.trim(), schedule:$('schedule').value.trim(), notes:$('notes').value.trim() };
    request('/api/resource-alignments', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) }).then(function () { $('alignmentForm').reset(); message('formMessage', 'Published to the TV board.', 'success'); return loadItems(); }).catch(function (error) { message('formMessage', error.message, 'error'); });
  });
  $('managerList').addEventListener('click', function (event) {
    var button = event.target.closest('[data-delete-id]'); if (!button) return;
    button.disabled = true;
    request('/api/resource-alignments/' + encodeURIComponent(button.getAttribute('data-delete-id')), { method:'DELETE' }).then(loadItems).catch(function (error) { button.disabled = false; message('formMessage', error.message, 'error'); });
  });
  $('lockButton').addEventListener('click', function () { managerCode = ''; sessionStorage.removeItem(CODE_STORAGE); $('managerWorkspace').hidden = true; $('loginPanel').hidden = false; $('managerCode').value = ''; $('managerCode').focus(); });
  var saved = sessionStorage.getItem(CODE_STORAGE); if (saved) unlock(saved).catch(function () { sessionStorage.removeItem(CODE_STORAGE); });
}());
