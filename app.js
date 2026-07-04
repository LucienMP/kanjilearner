(function(){
  "use strict";

  const menuBtn = document.getElementById("menuBtn");
  const drawer = document.getElementById("gradeDrawer");
  const overlay = document.getElementById("overlay");
  const closeDrawerBtn = document.getElementById("closeDrawer");
  const selectAllBtn = document.getElementById("selectAllGrades");
  const clearGradesBtn = document.getElementById("clearGrades");
  const generateBtn = document.getElementById("generateBtn");
  const printBtn = document.getElementById("printBtn");
  const questionCountEl = document.getElementById("questionCount");
  const studyStyleEl = document.getElementById("studyStyle");
  const answerKeyModeEl = document.getElementById("answerKeyMode");
  const answerKeyControl = document.getElementById("answerKeyControl");
  const showKanjiToggle = document.getElementById("showKanjiToggle");
  const showKanjiControl = document.getElementById("showKanjiControl");
  const exampleWordsToggle = document.getElementById("exampleWordsToggle");
  const exampleWordsControl = document.getElementById("exampleWordsControl");
  const sheetEl = document.getElementById("sheet");
  const emptyState = document.getElementById("emptyState");

  function updateModeControls(){
    const style = studyStyleEl.value;
    answerKeyControl.style.display = style === "worksheet" ? "" : "none";
    showKanjiControl.style.display = style === "trace" ? "" : "none";
    exampleWordsControl.style.display = (style === "worksheet" || style === "flashcards") ? "" : "none";
  }
  studyStyleEl.addEventListener("change", updateModeControls);
  updateModeControls();

  // Populate kanji counts per grade in the drawer.
  document.querySelectorAll(".gradeOption").forEach(function(opt){
    const grade = opt.dataset.grade;
    const count = (KANJI_DATA[grade] || []).length;
    opt.querySelector("small").textContent = count + " kanji";
  });

  function openDrawer(){
    drawer.classList.add("open");
    overlay.classList.add("show");
    drawer.setAttribute("aria-hidden","false");
    menuBtn.setAttribute("aria-expanded","true");
  }
  function closeDrawer(){
    drawer.classList.remove("open");
    overlay.classList.remove("show");
    drawer.setAttribute("aria-hidden","true");
    menuBtn.setAttribute("aria-expanded","false");
  }

  menuBtn.addEventListener("click", openDrawer);
  closeDrawerBtn.addEventListener("click", closeDrawer);
  overlay.addEventListener("click", closeDrawer);

  selectAllBtn.addEventListener("click", function(){
    document.querySelectorAll(".gradeOption input").forEach(function(cb){ cb.checked = true; });
  });
  clearGradesBtn.addEventListener("click", function(){
    document.querySelectorAll(".gradeOption input").forEach(function(cb){ cb.checked = false; });
  });

  function getSelectedGrades(){
    return Array.from(document.querySelectorAll(".gradeOption input:checked")).map(function(cb){ return cb.value; });
  }

  // Quick-pick dropdown for the Questions field: native <input list=datalist>
  // suggestions turned out to be unreliable across browsers (many hide the
  // list once the field already holds a matching value), so this is a small
  // self-contained menu we fully control: 10/20/30/50, then by 50s up to
  // however many kanji the current grade selection actually has, plus "All".
  const qcToggle = document.getElementById("qcToggle");
  const qcMenu = document.getElementById("qcMenu");

  function quickPicks(){
    const max = getSelectedGrades().reduce(function(sum, g){ return sum + (KANJI_DATA[g] || []).length; }, 0);
    const picks = [10, 20, 30, 50];
    for(let n = 100; n < max; n += 50) picks.push(n);
    if(max > 0 && picks[picks.length - 1] !== max) picks.push(max);
    return picks.filter(function(p){ return p <= max; });
  }

  function openQcMenu(){
    const picks = quickPicks();
    qcMenu.innerHTML = picks.map(function(p){ return '<button type="button" data-val="' + p + '">' + p + "</button>"; }).join("") +
      '<button type="button" data-val="All">All</button>';
    qcMenu.hidden = false;
  }
  function closeQcMenu(){ qcMenu.hidden = true; }

  qcToggle.addEventListener("click", function(e){
    e.stopPropagation();
    if(qcMenu.hidden) openQcMenu(); else closeQcMenu();
  });
  questionCountEl.addEventListener("focus", openQcMenu);
  qcMenu.addEventListener("click", function(e){
    const btn = e.target.closest("button[data-val]");
    if(!btn) return;
    questionCountEl.value = btn.dataset.val;
    closeQcMenu();
  });
  document.addEventListener("click", function(e){
    if(!qcMenu.hidden && !e.target.closest(".qcWrap")) closeQcMenu();
  });

  // Inclusion weight per slider value (0 = excluded, handled by filtering the
  // item out entirely rather than relying on a near-zero probability).
  const WEIGHT_MULTIPLIER = [0, 0.35, 0.65, 1, 1.8, 3];

  function weightForItem(item){
    const v = KanjiPrefs.get(item.k);
    return WEIGHT_MULTIPLIER[v] !== undefined ? WEIGHT_MULTIPLIER[v] : WEIGHT_MULTIPLIER[KanjiPrefs.DEFAULT_WEIGHT];
  }

  // Weighted random sample without replacement (A-Res algorithm): each item
  // gets a sort key of random()^(1/weight), so higher-weight items tend to
  // sort first while everything keeps a chance of being picked.
  function weightedSample(items, n){
    const scored = items.map(function(item){
      return { item: item, key: Math.pow(Math.random(), 1 / weightForItem(item)) };
    });
    scored.sort(function(a, b){ return b.key - a.key; });
    return scored.slice(0, n).map(function(s){ return s.item; });
  }

  // ---------- Manage Kanji dialog ----------
  const managePrefsBtn = document.getElementById("managePrefsBtn");
  const prefsOverlay = document.getElementById("prefsOverlay");
  const prefsDialog = document.getElementById("prefsDialog");
  const closePrefsDialogBtn = document.getElementById("closePrefsDialog");
  const overridesListEl = document.getElementById("overridesList");
  const gradeAccordionEl = document.getElementById("gradeAccordion");

  const WEIGHT_LABELS = ["Excluded", "Rare", "Less often", "Normal", "More often", "Often"];
  function weightLabel(v){
    return WEIGHT_LABELS[v] !== undefined ? WEIGHT_LABELS[v] : WEIGHT_LABELS[KanjiPrefs.DEFAULT_WEIGHT];
  }

  const sliderByKanji = {};

  function buildGradeAccordion(){
    for(let g = 1; g <= 6; g++){
      const entries = KANJI_DATA[g] || [];
      const details = document.createElement("details");
      details.className = "gradeDetails";
      details.appendChild(el("summary", null, "Grade " + g + " <small>(" + entries.length + " kanji)</small>"));
      const list = el("div", "gradeKanjiList");
      entries.forEach(function(item){
        const row = el("div", "kanjiPrefRow");
        row.appendChild(el("span", "kprKanji", item.k));
        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = "0";
        slider.max = "5";
        slider.step = "1";
        slider.setAttribute("list", "weightTicks");
        slider.className = "weightSlider";
        slider.value = String(KanjiPrefs.get(item.k));
        const label = el("span", "kprLabel", weightLabel(KanjiPrefs.get(item.k)));
        slider.addEventListener("input", function(){
          const v = parseInt(slider.value, 10);
          label.textContent = weightLabel(v);
          KanjiPrefs.set(item.k, v);
        });
        row.appendChild(slider);
        row.appendChild(label);
        list.appendChild(row);
        sliderByKanji[item.k] = { slider: slider, label: label };
      });
      details.appendChild(list);
      gradeAccordionEl.appendChild(details);
    }
  }

  function renderOverridesList(){
    const overrides = KanjiPrefs.getOverrides();
    overridesListEl.innerHTML = "";
    if(!overrides.length){
      overridesListEl.appendChild(el("p", "overridesEmpty",
        "No overrides yet — adjust any kanji below to exclude it or make it appear more or less often."));
      return;
    }
    overrides.forEach(function(o){
      const row = el("div", "ovrRow");
      row.appendChild(el("span", "ovrKanji", o.kanji));
      row.appendChild(el("span", "ovrLabel", weightLabel(o.weight)));
      const resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.className = "ovrReset";
      resetBtn.textContent = "Reset";
      resetBtn.addEventListener("click", function(){
        KanjiPrefs.set(o.kanji, KanjiPrefs.DEFAULT_WEIGHT);
      });
      row.appendChild(resetBtn);
      overridesListEl.appendChild(row);
    });
  }

  function refreshAllSlidersFromPrefs(){
    Object.keys(sliderByKanji).forEach(function(k){
      const v = KanjiPrefs.get(k);
      sliderByKanji[k].slider.value = String(v);
      sliderByKanji[k].label.textContent = weightLabel(v);
    });
  }

  // Refresh on every change, not just cloud "replace" -- otherwise actions
  // that don't go through a slider's own input handler (the overrides list's
  // Reset button, or a cloud sync) leave that slider showing a stale value.
  KanjiPrefs.onChange(function(){
    renderOverridesList();
    refreshAllSlidersFromPrefs();
  });

  buildGradeAccordion();
  renderOverridesList();

  function openPrefsDialog(){
    prefsOverlay.hidden = false;
    prefsDialog.hidden = false;
    prefsDialog.setAttribute("aria-hidden", "false");
  }
  function closePrefsDialog(){
    prefsOverlay.hidden = true;
    prefsDialog.hidden = true;
    prefsDialog.setAttribute("aria-hidden", "true");
  }
  managePrefsBtn.addEventListener("click", openPrefsDialog);
  closePrefsDialogBtn.addEventListener("click", closePrefsDialog);
  prefsOverlay.addEventListener("click", closePrefsDialog);

  // Strip okurigana-boundary dots for cleaner display; keep prefix/suffix hyphens.
  function cleanReading(r){
    return r.replace(/\./g, "");
  }

  function readingsText(list){
    return list.map(cleanReading).join("・");
  }

  function examplesFor(kanji){
    return (typeof KANJI_EXAMPLES !== "undefined" && KANJI_EXAMPLES[kanji]) || [];
  }

  // Word annotated with its reading as furigana (hiragana above the kanji),
  // matching how kanjiwakaru.com renders its own usage-example tables.
  function exampleRuby(ex){
    return "<ruby>" + ex.w + (ex.r ? "<rp>(</rp><rt>" + ex.r + "</rt><rp>)</rp>" : "") + "</ruby>";
  }

  function buildPool(grades){
    let pool = [];
    grades.forEach(function(g){
      pool = pool.concat(KANJI_DATA[g] || []);
    });
    return pool;
  }

  function pickQuestions(pool){
    const eligible = pool.filter(function(item){ return KanjiPrefs.get(item.k) > 0; });
    const raw = questionCountEl.value.trim().toLowerCase();
    if(raw === "" || raw === "all") return weightedSample(eligible, eligible.length);
    const n = parseInt(raw, 10);
    if(!Number.isFinite(n) || n <= 0) return weightedSample(eligible, eligible.length);
    return weightedSample(eligible, Math.min(n, eligible.length));
  }

  function el(tag, className, html){
    const e = document.createElement(tag);
    if(className) e.className = className;
    if(html !== undefined) e.innerHTML = html;
    return e;
  }

  function answerKeyGrid(items, includeExamples){
    const grid = el("div", "akGrid");
    items.forEach(function(item){
      const on = item.o.length ? readingsText(item.o) : "—";
      const kun = item.y.length ? readingsText(item.y) : "—";
      let html = '<span class="akKanji">' + item.k + '</span>' +
        '<span class="akReadings"><b>On</b> ' + on + '&nbsp; &nbsp;<b>Kun</b> ' + kun;
      if(includeExamples){
        const examples = examplesFor(item.k);
        if(examples.length){
          html += '<br><span class="akExamples"><b>Examples</b> ' +
            examples.map(function(ex){ return exampleRuby(ex) + " — " + ex.m; }).join("; ") + "</span>";
        }
      }
      html += "</span>";
      grid.appendChild(el("div", "akItem", html));
    });
    return grid;
  }

  function renderWorksheet(items, answerKeyMode, includeExamples){
    const page = el("div", "sheetPage");
    page.appendChild(el("h2", "sheetTitle", "Kanji Worksheet &mdash; write the readings"));
    page.appendChild(el("p", "sheetSub", items.length + " kanji"));
    items.forEach(function(item){
      const row = el("div", "wsRow");
      row.appendChild(el("div", "wsKanji", item.k));
      const blanks = el("div", "wsBlanks");
      const onLabel = "Onyomi" + (item.o.length > 1 ? " (" + item.o.length + ")" : "");
      const kunLabel = "Kunyomi" + (item.y.length > 1 ? " (" + item.y.length + ")" : "");
      blanks.appendChild(el("div", "wsBlankLine", '<span class="lbl">' + onLabel + '</span><span class="rule"></span>'));
      blanks.appendChild(el("div", "wsBlankLine", '<span class="lbl">' + kunLabel + '</span><span class="rule"></span>'));
      const examples = includeExamples ? examplesFor(item.k) : [];
      examples.forEach(function(ex){
        const wordHtml = '<span class="exWordWrap"><span class="exFuriBlank"></span><span class="exWord">' + ex.w + '</span></span>';
        blanks.appendChild(el("div", "wsBlankLine wsExampleLine", '<span class="lbl exLbl">' + wordHtml + '</span><span class="rule"></span>'));
      });
      if(answerKeyMode === "below"){
        const on = item.o.length ? readingsText(item.o) : "—";
        const kun = item.y.length ? readingsText(item.y) : "—";
        blanks.appendChild(el("div", "wsAnswer", '<b>Answer</b> On ' + on + '&nbsp; &nbsp;Kun ' + kun));
        if(examples.length){
          blanks.appendChild(el("div", "wsAnswer", '<b>Examples</b> ' +
            examples.map(function(ex){ return exampleRuby(ex) + " — " + ex.m; }).join("; ")));
        }
      }
      row.appendChild(blanks);
      page.appendChild(row);
    });

    const pages = [page];
    if(answerKeyMode === "page"){
      const akPage = el("div", "sheetPage");
      akPage.appendChild(el("h2", "sheetTitle", "Answer Key"));
      akPage.appendChild(answerKeyGrid(items, includeExamples));
      pages.push(akPage);
    }
    return pages;
  }

  function buildModelBox(kanji){
    const svgData = KANJI_SVG[kanji];
    const box = el("div", "traceBox model");
    if(!svgData) return box;
    const pathsHtml = svgData.p.map(function(d){ return '<path d="' + d + '"/>'; }).join("");
    const numsHtml = svgData.n.map(function(t){ return '<text x="' + t[0] + '" y="' + t[1] + '">' + t[2] + "</text>"; }).join("");
    box.innerHTML = '<svg viewBox="' + svgData.vb + '" class="modelSvg">' +
      '<g class="modelPaths">' + pathsHtml + '</g>' +
      '<g class="modelNums">' + numsHtml + '</g></svg>';
    return box;
  }

  function renderTrace(items, showKanji){
    const page = el("div", "sheetPage");
    page.appendChild(el("h2", "sheetTitle", "Kanji Worksheet &mdash; write the kanji"));
    page.appendChild(el("p", "sheetSub", items.length + " kanji &middot; 10 boxes each"));
    items.forEach(function(item){
      const entry = el("div", "trEntry");
      const head = el("div", "trHead");
      const on = item.o.length ? '<span class="trReadings"><span class="lbl">ON</span>' + readingsText(item.o) + "</span>" : "";
      const kun = item.y.length ? '<span class="trReadings"><span class="lbl">KUN</span>' + readingsText(item.y) + "</span>" : "";
      head.innerHTML = on + kun + '<span class="trMeaning">' + item.m + "</span>";
      entry.appendChild(head);
      const boxes = el("div", "trBoxes");
      for(let i = 0; i < 10; i++){
        if(i === 0 && showKanji){
          boxes.appendChild(buildModelBox(item.k));
        } else {
          boxes.appendChild(el("div", "traceBox"));
        }
      }
      entry.appendChild(boxes);
      page.appendChild(entry);
    });
    return [page];
  }

  function renderFlashcards(items, includeExamples){
    const page = el("div", "sheetPage");
    page.appendChild(el("h2", "sheetTitle", "Fold Flashcards"));
    page.appendChild(el("p", "sheetSub", items.length + " cards &mdash; cut along the outer border, fold along the dashed line"));
    const grid = el("div", "fcGrid");
    items.forEach(function(item){
      const card = el("div", "fcCard");
      const examples = includeExamples ? examplesFor(item.k) : [];

      let leftHtml = '<span class="fcKanji">' + item.k + "</span>";
      if(examples.length){
        leftHtml += '<span class="fcWords">' + examples.map(function(ex){ return ex.w; }).join(", ") + "</span>";
      }
      card.appendChild(el("div", "fcHalf fcLeft", leftHtml));
      card.appendChild(el("div", "fcFold"));

      const onText = item.o.length ? readingsText(item.o) : "";
      const kunText = item.y.length ? readingsText(item.y) : "";
      const exText = examples.length ? examples.map(function(ex){ return exampleRuby(ex) + " -- " + ex.m; }).join(", ") : "";
      let readingsHtml = "";
      if(onText) readingsHtml += '<div class="row"><span class="lbl">ON</span>' + onText + "</div>";
      if(kunText) readingsHtml += '<div class="row"><span class="lbl">KUN</span>' + kunText + "</div>";
      if(exText){
        if(onText || kunText) readingsHtml += '<div class="exDivider"></div>';
        readingsHtml += '<div class="row exRow">' + exText + "</div>";
      }
      const readingsWrap = el("div", "fcHalf");
      readingsWrap.appendChild(el("div", "fcReadings", readingsHtml));
      card.appendChild(readingsWrap);
      grid.appendChild(card);
    });
    page.appendChild(grid);
    return [page];
  }

  // Cards render at their natural content height first; once laid out in the
  // live DOM we measure the tallest one and stretch every card to match, so
  // the whole deck is one uniform size instead of shrink-wrapping per card.
  function equalizeFlashcardHeights(container){
    const cards = container.querySelectorAll(".fcCard");
    if(!cards.length) return;
    cards.forEach(function(c){ c.style.height = ""; });
    let max = 0;
    cards.forEach(function(c){
      max = Math.max(max, c.getBoundingClientRect().height);
    });
    cards.forEach(function(c){ c.style.height = max + "px"; });
  }

  function generate(){
    const grades = getSelectedGrades();
    if(grades.length === 0){
      alert("Please choose at least one Kanji grade from the menu.");
      openDrawer();
      return;
    }
    const pool = buildPool(grades);
    const items = pickQuestions(pool);
    const style = studyStyleEl.value;

    let pages;
    if(style === "worksheet") pages = renderWorksheet(items, answerKeyModeEl.value, exampleWordsToggle.checked);
    else if(style === "trace") pages = renderTrace(items, showKanjiToggle.checked);
    else pages = renderFlashcards(items, exampleWordsToggle.checked);

    sheetEl.innerHTML = "";
    pages.forEach(function(p){ sheetEl.appendChild(p); });
    if(style === "flashcards") equalizeFlashcardHeights(sheetEl);
    emptyState.style.display = "none";
  }

  generateBtn.addEventListener("click", generate);
  printBtn.addEventListener("click", function(){
    if(!sheetEl.hasChildNodes()) generate();
    window.print();
  });
})();
