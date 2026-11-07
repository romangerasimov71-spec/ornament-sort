// Taken from the tech review: fakes a real ad-supporting platform (methods return undefined,
// states arrive asynchronously). window.__adMode = "ok" | "cancel" | "fail".
// init script: after bridge.initialize resolves, replace bridge.advertisement with a fake that mimics
// the real SDK: showRewarded/showInterstitial return undefined, states arrive asynchronously.
window.__adlog=[];
document.addEventListener('load', (e) => {
  const el = e.target;
  if (!el || el.tagName !== 'SCRIPT' || !/playgama-bridge\.js/.test(el.src || '')) return;
  const v = window.bridge;
  const init = v.initialize.bind(v);
  v.initialize = (...a) => init(...a).then((r) => {
    const real = v.advertisement;
    const cbs = {};
    const mode = window.__adMode || 'ok';
    const fake = {
      isRewardedSupported: true, isInterstitialSupported: true, interstitialState: 'closed', rewardedState: 'closed',
      on(n, cb) { (cbs[n] = cbs[n] || []).push(cb); },
      emit(n, s) { window.__adlog.push(n + ':' + s); (cbs[n] || []).forEach(f => f(s)); },
      showRewarded(pl) { window.__adlog.push('showRewarded:' + pl);
        const E = v.EVENT_NAME.REWARDED_STATE_CHANGED;
        setTimeout(() => fake.emit(E, 'loading'), 50);
        setTimeout(() => fake.emit(E, 'opened'), 150);
        if ((window.__adMode||'ok') === 'ok') setTimeout(() => fake.emit(E, 'rewarded'), window.__rewardAt || 1500);
        setTimeout(() => fake.emit(E, (window.__adMode||'ok') === 'fail' ? 'failed' : 'closed'), (window.__rewardAt || 1500) + 100);
      },
      showInterstitial(pl) { window.__adlog.push('showInterstitial:' + pl);
        const E = v.EVENT_NAME.INTERSTITIAL_STATE_CHANGED;
        setTimeout(() => fake.emit(E, 'loading'), 50);
        setTimeout(() => fake.emit(E, 'opened'), 150);
        setTimeout(() => fake.emit(E, 'closed'), 2000);
      }
    };
    Object.defineProperty(v, 'advertisement', { get: () => fake, configurable: true });
    return r;
  });
}, true);
