// Per-kanji inclusion weight (0-5: excluded, rare, less often, normal, more
// often, often). Stored locally so the site keeps working with no backend;
// firebase-sync.js layers optional cross-device sync on top of this.
var KanjiPrefs = (function(){
  "use strict";
  var STORAGE_KEY = "kanjiPrefsV1";
  var DEFAULT_WEIGHT = 3;
  var prefs = {};
  try {
    prefs = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch(e){
    prefs = {};
  }
  var listeners = [];

  function persist(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }
  function notify(reason){
    listeners.forEach(function(fn){ fn(reason); });
  }

  return {
    DEFAULT_WEIGHT: DEFAULT_WEIGHT,
    get: function(kanji){
      return Object.prototype.hasOwnProperty.call(prefs, kanji) ? prefs[kanji] : DEFAULT_WEIGHT;
    },
    set: function(kanji, value){
      if(value === DEFAULT_WEIGHT) delete prefs[kanji];
      else prefs[kanji] = value;
      persist();
      notify("set");
    },
    getOverrides: function(){
      return Object.keys(prefs).map(function(k){ return { kanji: k, weight: prefs[k] }; });
    },
    getRaw: function(){
      return prefs;
    },
    replaceAll: function(newPrefs){
      prefs = newPrefs || {};
      persist();
      notify("replace");
    },
    onChange: function(fn){
      listeners.push(fn);
    }
  };
})();
