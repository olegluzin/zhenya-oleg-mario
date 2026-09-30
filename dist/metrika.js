/* Yandex Metrika: production hosts only; no session recording or private URL tokens. */
(function () {
  'use strict';
  var counter = 113186534, host = "zhenya.olegluzin.ru", title = "Люблю Женёчка";
  if (location.hostname !== host && location.hostname !== 'www.' + host) return;
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
  if (/^\/(?:admin|api)(?:\/|$)/.test(location.pathname)) return;
  var guard = '__metrika' + counter;
  if (window[guard]) return;
  window[guard] = true;
  function clean(value, originOnly) {
    try { var u = new URL(value, location.href); return /^https?:$/.test(u.protocol) ? u.origin + (originOnly ? '/' : u.pathname) : ''; }
    catch (_) { return ''; }
  }
  (function(m,e,t,r,i,k,a){
    m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
    m[i].l=1*new Date();
    k=e.createElement(t);a=e.getElementsByTagName(t)[0];k.async=1;k.src=r;a.parentNode.insertBefore(k,a);
  })(window,document,'script','https://mc.yandex.ru/metrika/tag.js?id='+counter,'ym');
  var last = clean(location.href, false);
  ym(counter, 'init', {defer:true, webvisor:false, clickmap:false, trackLinks:false, trackHash:false,
    ecommerce:false, disableYtm:true, sendTitle:false, accurateTrackBounce:true, url:last,
    referrer:document.referrer ? clean(document.referrer,true) : ''});
  ym(counter, 'hit', last, {title:title, referer:document.referrer ? clean(document.referrer,true) : ''});
  // Track public route changes without sending invitation, postcard, profile or room codes.
  function pageChanged() {
    var next = clean(location.href,false);
    if (next === last || /^\/(?:admin|api)(?:\/|$)/.test(location.pathname)) return;
    var previous = last; last = next;
    ym(counter, 'hit', next, {title:title, referer:previous});
  }
  ['pushState','replaceState'].forEach(function(name){
    var original = history[name];
    history[name] = function(){var result=original.apply(this,arguments);pageChanged();return result;};
  });
  window.addEventListener('popstate',pageChanged);
  document.addEventListener('click',function(event){
    var link = event.target.closest && event.target.closest('a[href]');
    if (!link) return;
    var target = clean(link.href,false);
    if (target && new URL(target).origin !== location.origin) ym(counter,'extLink',target,{title:title});
  });
})();
