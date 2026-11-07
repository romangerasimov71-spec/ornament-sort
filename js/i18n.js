/* Texts. The language comes only from bridge.platform.language (see game.js). */
(function () {
  'use strict';
  var STR = {
    en: {
      title: 'Ornament Sort',
      subtitle: 'Sort the glass ornaments by color',
      play: 'Play',
      level: 'Level {n}',
      moves: 'Moves: {n}',
      extra: 'Watch ad: +1 empty box',
      undo: 'Undo',
      restart: 'Restart',
      levels: 'Levels',
      sound: 'Sound',
      tut1: 'Tap a box to pick up the top ornament',
      tut2: 'Now tap the box to put it in',
      tut3: 'One color in every box!',
      goal: 'Fill every box with one color',
      stuck: 'No moves left. Try Undo or Restart',
      noUndo: 'No undos left',
      adFail: 'The ad is not available right now',
      extraGot: '+1 empty box!',
      winTitle: 'Well done!',
      winSub: 'Level {n} complete',
      winMoves: 'Moves: {n}',
      next: 'Next',
      replay: 'Replay',
      allDone: 'All levels done! More are on the way.',
      close: 'Close'
    },
    ru: {
      title: 'Новогодняя сортировка',
      subtitle: 'Разложи ёлочные шары по цветам',
      play: 'Играть',
      level: 'Уровень {n}',
      moves: 'Ходы: {n}',
      extra: 'Реклама: +1 пустая коробка',
      undo: 'Отменить ход',
      restart: 'Заново',
      levels: 'Уровни',
      sound: 'Звук',
      tut1: 'Нажми на коробку — возьмёшь верхний шар',
      tut2: 'Теперь нажми, куда его положить',
      tut3: 'В каждой коробке — один цвет!',
      goal: 'Собери в каждой коробке один цвет',
      stuck: 'Ходов нет. Отмени ход или начни заново',
      noUndo: 'Отмены закончились',
      adFail: 'Реклама сейчас недоступна',
      extraGot: '+1 пустая коробка!',
      winTitle: 'Отлично!',
      winSub: 'Уровень {n} пройден',
      winMoves: 'Ходы: {n}',
      next: 'Дальше',
      replay: 'Ещё раз',
      allDone: 'Все уровни пройдены! Скоро будут новые.',
      close: 'Закрыть'
    }
  };
  var lang = 'en';
  window.OSI18n = {
    setLanguage: function (code) {
      lang = (typeof code === 'string' && code.toLowerCase().indexOf('ru') === 0) ? 'ru' : 'en';
      document.documentElement.lang = lang;
      return lang;
    },
    lang: function () { return lang; },
    t: function (key, params) {
      var s = (STR[lang] && STR[lang][key]) || STR.en[key] || key;
      if (params) for (var p in params) s = s.replace('{' + p + '}', params[p]);
      return s;
    }
  };
})();
