// Adapter template for the ads test kit. Copy it next to your game's tests (e.g. tests/ads-adapter.js)
// and fill in the functions for YOUR game. The kit (fakeads.js + run.js) stays the same for every game.
// A working example: tests/ads-adapter.js of the game "ornament-sort".
module.exports = {
  name: 'My Game',
  viewport: { width: 390, height: 844 },   // phone portrait
  // contextOptions: { hasTouch: true, isMobile: true, locale: 'ru-RU' },

  // How long the game itself waits for a rewarded ad that never answers before it gives up (ms).
  // The kit waits this long (+0.8 s) in the "silent" and "late" cases.
  rewardTimeoutMs: 12000,
  // How long to wait after an interstitial that never answers (ms).
  interstitialSilentWaitMs: 3000,
  // An ad that opens after rewardTimeoutMs and is watched to the end gives the reward (true by default).
  lateRewardGranted: true,

  // Bring the game to the place where the reward button / the interstitial is reachable.
  // kind = 'rewarded' | 'interstitial'. The page is already open, fakeads.js is in place.
  async prepare(page, { kind, caseName }) {
    // await page.click('#play');
  },

  // Press the button "watch an ad for a reward".
  async clickRewarded(page) {
    // await page.click('#btn-reward');
  },

  // How many rewards the player has now (coins, lives, extra boxes...). Any number that grows by 1
  // for one reward is fine.
  async rewardCount(page) {
    // return page.evaluate(() => window.game.coins / 50);
    return 0;
  },

  // Do what shows an interstitial (finish a level and press "Next"...). Leave it out to skip those cases.
  async triggerInterstitial(page) {
    // await page.click('#btn-next');
  },

  // The board reacts to the player: make a harmless action and check the game answered. true / false.
  async boardWorks(page) {
    return true;
  },

  // Optional: the buttons are on again (not greyed out, a menu opens). true / false.
  async buttonsWork(page) {
    return true;
  },

  // Optional: is the game paused right now? true / false. Without it the kit cannot check the pause.
  // async isPaused(page) { return page.evaluate(() => window.game.paused); },

  // Optional: is the sound off right now? By default the kit looks at AudioContext / <audio> / Howler
  // itself; a game that mutes only with a volume (gain) node needs its own check here.
  // async soundOff(page) { return page.evaluate(() => window.game.masterVolume === 0); },
};
