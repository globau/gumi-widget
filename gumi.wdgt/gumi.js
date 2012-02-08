/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* gumi widget
 * byron@glob.com.au
 * glob.com.au/gumi */

// globals

var g_username;
var g_password;
var g_domain;
var g_current_usage_xml;
var g_last_updated;
var g_timer;
var g_show_unused;

// paths to xml attributes/elements

var XPATHS = new Array();
XPATHS['days-so-far'] = 'ii_feed/volume_usage/quota_reset/days_so_far';
XPATHS['days-remaining'] = 'ii_feed/volume_usage/quota_reset/days_remaining';
XPATHS['peak'] = 'ii_feed/volume_usage/expected_traffic_types/type[@classification="peak"]/';
XPATHS['peak-used'] = XPATHS['peak'] + '@used';
XPATHS['peak-quota'] = XPATHS['peak'] + 'quota_allocation';
XPATHS['offpeak'] = 'ii_feed/volume_usage/expected_traffic_types/type[@classification="offpeak"]/';
XPATHS['offpeak-used'] = XPATHS['offpeak'] + '@used';
XPATHS['offpeak-quota'] = XPATHS['offpeak'] + 'quota_allocation';
XPATHS['freezone'] = 'ii_feed/volume_usage/expected_traffic_types/type[@classification="freezone"]/';
XPATHS['freezone-used'] = XPATHS['freezone'] + '@used';
XPATHS['offpeak-start'] = 'ii_feed/volume_usage/offpeak_start';
XPATHS['offpeak-end'] = 'ii_feed/volume_usage/offpeak_end';
XPATHS['plan'] = 'ii_feed/account_info/plan';
XPATHS['error'] = 'ii_feed/error';

// initialisation

function init() {
  g_show_unused = new Array();
  g_show_unused['peak'] = false;
  g_show_unused['offpeak'] = false;
  init_ui();
  read_configuration();
  if (!g_username) {
    show_configuration(undefined);
  } else {
    refresh_ui();
    init_timer();
  }
}

function init_ui() {
  // create apple buttons
  var info_button = new AppleInfoButton($('info-button'), $('front'), "black", "black", show_configuration);
  var done_button = new AppleGlassButton($('done-button'), 'Done', hide_configuration);
  var test_button = new AppleGlassButton($('test-button'), 'Test', test_configuration);

  // hook up events
  $('tab-graphs').onclick = show_graphs;
  $('tab-table').onclick = show_table;
  $('peak-usage-text').onclick = toggle_peak_unused;
  $('offpeak-usage-text').onclick = toggle_offpeak_unused;

  // hide transients
  hide('spinner-front');
  hide('spinner-back');
  hide('error-front');
  hide('error-back');

  // show the front:graphs first
  hide('back');
  show('front');
  show_graphs();
}

function init_timer() {
  if (g_timer) {
    clearInterval(g_timer);
    g_timer = undefined;
  }
  poll();
  g_interval = setInterval('poll()', 900000);  // 15 minutes
}

function show_graphs() {
  hide('table');
  $('tab-table-img').src = 'table0.png';
  show('graphs');
  $('tab-graphs-img').src = 'graphs1.png';
}

function show_table() {
  hide('graphs');
  $('tab-graphs-img').src = 'graphs0.png';
  show('table');
  $('tab-table-img').src = 'table1.png';
}

function toggle_peak_unused() {
  g_show_unused['peak'] = !g_show_unused['peak'];
  refresh_ui();
}

function toggle_offpeak_unused() {
  g_show_unused['offpeak'] = !g_show_unused['offpeak'];
  refresh_ui();
}

function show_configuration(event) {
  // flip to configuration
  if (window.widget)
    widget.prepareForTransition("ToBack");
  hide('front');
  show('back');
  if (window.widget)
    setTimeout('widget.performTransition()', 0);
}

function hide_configuration(event) {
  if (!save_configuration())
    return;
  // flip to front
  if (window.widget)
    widget.prepareForTransition("ToFront");
  hide('back');
  show('front');
  if (window.widget)
    setTimeout('widget.performTransition()', 0);
  init_timer();
}

function test_configuration() {
  if (!save_configuration())
    return;
  poll();
}

function read_configuration() {
  // read configuration from widget
  if (window.widget) {
    g_domain = widget.preferenceForKey('domain') || '';
    g_username = widget.preferenceForKey('username') || '';
    g_password = decrypt(widget.preferenceForKey('password') || '');
  } else {
    g_domain = 'westnet';
    g_username = 'debug';
    g_password = 'debug';
  }
  $('isp').value = g_domain || '';
  $('username').value = g_username || '';
  $('password').value = g_password || '';
}

function save_configuration() {
  g_domain = $('isp').value || '';
  g_username = $('username').value || '';
  g_password = $('password').value || '';

  if (!g_username) {
    $('username').className = 'missing';
  } else {
    $('username').className = '';
  }

  if (!g_password) {
    $('password').className = 'missing';
  } else {
    $('password').className = '';
  }

  if (!(g_username && g_password))
    return false;

  if (window.widget) {
    widget.setPreferenceForKey(g_domain, 'domain');
    widget.setPreferenceForKey(g_username, 'username');
    widget.setPreferenceForKey(encrypt(g_password), 'password');
  }

  return true;
}

function refresh_ui() {
  // update ui elements after a poll
  $('domain').src = g_domain + '.png';
  if (!g_current_usage_xml)
    return;
  refresh_graph('peak');
  refresh_graph('offpeak');
  refresh_table();
}

function refresh_graph(name) {
  // update peak/offpeak text, percentage bar, etc
  var used = xpi(name + '-used');
  var quota = xpi(name + '-quota') * 1024 * 1024;
  var days = Math.round(xpi('days-so-far') / (xpi('days-so-far') + xpi('days-remaining') - 1) * 100);
  if (days > 100)
    days = 100;
  var percent = quota == 0 ? 0 : Math.round(used / quota * 100);
  if (percent > 100)
    percent = 100;

  $(name + '-usage-text').innerHTML = g_show_unused[name]
    ? '-' + bytes_to_size(quota - used)
    : bytes_to_size(used);
  set_style('#' + name + '-used', 'width', percent + '%');
  set_style('#' + name + '-target', 'width', days + '%');
  $(name + '-percent').innerHTML = percent + '%';
}

function refresh_table() {
  var t = $('table-data');
  var r;

  while (t.rows.length)
    t.deleteRow(0);

  add_row(t, 'Peak',
    bytes_to_size(xpi('peak-used')),
    bytes_to_size(xpi('peak-quota') * 1024 * 1024)
  );
  add_row(t, 'Off-Peak',
    bytes_to_size(xpi('offpeak-used')),
    bytes_to_size(xpi('offpeak-quota') * 1024 * 1024)
  );
  add_row(t, 'Freezone', bytes_to_size(xpi('freezone-used')), '');

  add_row(t, 'Updated', g_last_updated ? date_to_short(g_last_updated) : 'never');
  add_row(t, 'Off-Peak', xps('offpeak-start') + ' - ' + xps('offpeak-end'));
}

function add_row(t, name, value1, value2) {
  var r = t.insertRow(t.rows.length);
  var c = r.insertCell(0);
  c.className = 'name';
  c.appendChild(document.createTextNode(name + ':'));
  c = r.insertCell(1);
  c.appendChild(document.createTextNode(value1));
  if (value2 != undefined) {
    c.className = 'value';
    c = r.insertCell(2);
    c.className = 'value';
    c.appendChild(document.createTextNode(value2));
  } else {
    c.className = 'single_value';
    c.colSpan = '2';
  }
}

function poll() {
  // grab usage from westnet/iinet/debug
  var url;

  if (window.widget) {
    var username, cgi;
    if (g_domain == 'westnet') {
      cgi = 'https://myaccount2.westnet.com.au/cgi-bin/new/volume_usage_xml.cgi'
      username = g_username + '@westnet.com.au';
    } else {
      cgi = 'https://toolbox.iinet.net.au/cgi-bin/new/volume_usage_xml.cgi';
      username = g_username + '@iinet.net.au';
    }
    url = cgi + 
      '?action=login' +
      '&username=' + encodeURIComponent(username) +
      '&password=' + encodeURIComponent(g_password);
  } else {
    url = 'http://glob.com.au/landfill/usage.xml';
  }

  try {
    show('spinner-front');
    show('spinner-back');
    xhr = new XMLHttpRequest();
    xhr.overrideMimeType("text/xml");
    xhr.onreadystatechange =  function() {
      if (xhr.readyState == 4) {
        hide('spinner-front');
        hide('spinner-back');
        if (xhr.status == 200) {
          g_current_usage_xml = xhr.responseXML;
          if (xps('error')) {
            show_error(xps('error'));
          } else {
            clear_error();
            g_last_updated = new Date();
          }
          setTimeout('refresh_ui()', 0);
        }
      }
    };
    xhr.open("GET", url);
    xhr.setRequestHeader("Cache-Control", "no-cache");
    xhr.send(null);
  } catch (e) {
    hide('spinner-front');
    hide('spinner-back');
    show_error(e.message);
  }
}

// 

function clear_error() {
  hide('error-front');
  hide('error-back');
}

function show_error(message) {
  alert(message);
  $('error-front').title = message;
  $('error-back').title = message;
  show('error-front');
  show('error-back');
}

// helpers

function show(id) {
  $(id).style.display = '';
}

function hide(id) {
  $(id).style.display = 'none';
}

function bytes_to_size(bytes) {
  // don't return anything > mb because westnet measures
  // quotas in MB not GB.
  // eg. 50,000MB quota (47.8GB, not 50GB)
  var kilobyte = 1024;
  var megabyte = kilobyte * 1024;
  if ((bytes >= 0) && (bytes < kilobyte)) {
    return bytes + ' B';
  } else if ((bytes >= kilobyte) && (bytes < megabyte)) {
    return (bytes / kilobyte).toFixed(0) + ' KB';
  } else {
    return commify((bytes / megabyte).toFixed(0)) + ' MB';
  }
}

function commify(number) {
  number += '';
  var a = number.split('.');
  var a1 = a[0];
  var a2 = a.length > 1 ? '.' + a[1] : '';
  var re = /(\d+)(\d{3})/;
  while (re.test(a1)) {
    a1 = a1.replace(re, '$1' + ',' + '$2');
  }
  return a1 + a2;
}

function date_to_short(date) {
  var d = date.getDate();
  var m = date.getMonth();
  var h = date.getHours();
  var n = date.getMinutes();
  var months = new Array('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec');
  if (h > 12) {
    n = n + 'p';
    h = h - 12;
  } else {
    n = n + 'a';
  }
  return d + ' ' + months[m] + ' ' + h + ':' + n;
}

function set_style(selector, name, value) {
  for (var i = 0, il = document.styleSheets.length; i < il; i++) {
    var styleSheet = document.styleSheets[i];
    for (var j = 0, jl = styleSheet.cssRules.length; j < jl; j++) {
      var cssRule = styleSheet.cssRules[j];
      if (cssRule.selectorText == selector) {
        cssRule.style[name] = value;
        return;
      }
    }
  }
}

function $(name) {
  return document.getElementById(name);
}

function xps(name) {
  return xp_value(XPATHS[name]);
}

function xpi(name) {
  var value = xps(name);
  return value ? value * 1 : 0;
}

function xp_value(path) {
  var iterator = g_current_usage_xml.evaluate(path, g_current_usage_xml, null, XPathResult.ANY_TYPE, null);
  try {
    var n = iterator.iterateNext();
    if (n)
      return n.textContent;
  } catch (e) {
    console && console.error(e);
  }
  return '';
}

function rot_13(value) {
  var rxi = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var rxo = 'NOPQRSTUVWXYZABCDEFGHIJKLMnopqrstuvwxyzabcdefghijklm5678901234';
  var map = [];
  var buf = '';
  for (z = 0; z < rxi.length; z++) {
    map[rxi.substr(z, 1)] = rxo.substr(z, 1);
  }
  for (z = 0; z < value.length; z++) {
    var c = value.charAt(z);
    buf += (c in map ? map[c] : c);
  }
  return buf;
}

function encrypt(value) {
  // not really encryption, but there's no point using real encryption
  // as the shared secret will have to live on the same system as the
  // encrypted data
  return btoa(rot_13(value));
}

function decrypt(value) {
  try {
    return rot_13(atob(value));
  } catch (e) {
    return '';
  }
}

