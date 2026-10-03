// 先生くじ：画面の動き
(function () {
  "use strict";

  var CONFIG = window.KUJI_CONFIG;
  var L = window.Lottery;
  var STORAGE_KEY = "sensei-kuji-state-v1";
  var BACKUP_KEY = STORAGE_KEY + "-backup"; // 念のための2つ目の保存場所
  var CSV_URL = "../data/teachers.csv";
  var tableKeys = Object.keys(CONFIG.categoryTable).map(Number).sort(function (a, b) { return a - b; });

  var $ = function (id) { return document.getElementById(id); };

  // ---------------- 保存（localStorage） ----------------
  var storageOk = true;

  function defaultState() {
    var groups = {};
    CONFIG.classes.forEach(function (c) { groups[c.id] = CONFIG.defaultGroups; });
    return {
      groups: groups,          // 各クラスの班数
      assignment: null,        // { classId: ["先生名", ...] }（班順）
      revealed: {},            // { classId: [true/false, ...] }
      createdAt: null,
      teachers: [],            // 割当を作ったときの先生データ（保存ファイル・引き直し用）
      excluded: [],            // 引き直しで外した先生（もう選ばない）
      redrawLog: [],           // 引き直しの記録
      view: "setup",           // "setup" | "lottery" | "list"
      currentClass: CONFIG.classes[0].id,
      currentGroup: {},        // { classId: 班の番号(0始まり) }
    };
  }

  function loadState() {
    var s = defaultState();
    var saved = null;
    [STORAGE_KEY, BACKUP_KEY].some(function (key) {
      try {
        var raw = localStorage.getItem(key);
        if (raw) saved = JSON.parse(raw);
      } catch (e) {
        saved = null; // 壊れていたら、もう一方を試す
      }
      return saved && typeof saved === "object";
    });
    if (saved) {
      Object.keys(s).forEach(function (k) { if (saved[k] !== undefined) s[k] = saved[k]; });
    }
    try { localStorage.setItem(STORAGE_KEY + "-test", "1"); localStorage.removeItem(STORAGE_KEY + "-test"); }
    catch (e) { storageOk = false; }
    // 保存内容が壊れていた場合の安全策
    if (s.assignment && typeof s.assignment !== "object") s.assignment = null;
    CONFIG.classes.forEach(function (c) {
      if (!(s.groups[c.id] > 0)) s.groups[c.id] = CONFIG.defaultGroups;
    });
    if (!CONFIG.classes.some(function (c) { return c.id === s.currentClass; })) {
      s.currentClass = CONFIG.classes[0].id;
    }
    if (!Array.isArray(s.excluded)) s.excluded = [];
    if (!Array.isArray(s.redrawLog)) s.redrawLog = [];
    if (!s.assignment) s.view = "setup";
    return s;
  }

  function saveState() {
    try {
      var json = JSON.stringify(state);
      localStorage.setItem(STORAGE_KEY, json);
      localStorage.setItem(BACKUP_KEY, json);
    } catch (e) {
      storageOk = false;
      $("storage-warning").hidden = false;
    }
  }

  var state = loadState();
  var csv = { loaded: false, teachers: [], errors: [], source: "" };
  var csvLoading = false;

  // ---------------- 画面切り替え ----------------
  function showView(view) {
    state.view = view;
    saveState();
    $("setup").hidden = view !== "setup";
    $("lottery").hidden = view !== "lottery";
    $("list").hidden = view !== "list";
    // 準備画面・くじ画面に来たら、管理メニューは閉じ、くじ前の結果は表示しない状態に戻す
    if (view !== "list") { redrawOpen = false; showHidden = false; }
    $("wizard").hidden = true;
    if (view === "setup") {
      renderSetup();
      if (!csv.loaded) loadCsvFromServer();
    } else if (view === "list") {
      renderList();
    } else {
      renderLottery();
    }
    window.scrollTo(0, 0);
  }

  // ================================================================
  //  授業準備画面
  // ================================================================
  function buildGroupInputs() {
    var box = $("group-inputs");
    box.innerHTML = "";
    CONFIG.classes.forEach(function (c) {
      var row = document.createElement("label");
      row.className = "group-row";
      var name = document.createElement("span");
      name.className = "cls";
      name.textContent = c.name;
      var input = document.createElement("input");
      input.type = "number";
      input.inputMode = "numeric";
      input.min = tableKeys[0];
      input.max = tableKeys[tableKeys.length - 1];
      input.value = state.groups[c.id];
      input.addEventListener("input", function () {
        state.groups[c.id] = parseInt(input.value, 10) || 0;
        saveState();
        renderSetup();
      });
      var unit = document.createElement("span");
      unit.textContent = "班";
      row.appendChild(name);
      row.appendChild(input);
      row.appendChild(unit);
      box.appendChild(row);
    });
  }

  function setErrors(listEl, messages) {
    listEl.innerHTML = "";
    messages.forEach(function (m) {
      var li = document.createElement("li");
      li.textContent = m;
      listEl.appendChild(li);
    });
    listEl.hidden = messages.length === 0;
  }

  function assignmentMatchesGroups() {
    if (!state.assignment) return true;
    return CONFIG.classes.every(function (c) {
      return (state.assignment[c.id] || []).length === state.groups[c.id];
    });
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return (d.getMonth() + 1) + "月" + d.getDate() + "日 " +
      d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function renderSetup() {
    $("storage-warning").hidden = storageOk;

    // 先生データ
    var status = $("csv-status");
    status.className = "csv-status";
    if (csv.loaded && csv.errors.length === 0) {
      status.textContent = csv.source + "を読み込みました（合計 " + csv.teachers.length + "人）";
      status.classList.add("ok");
    } else if (csv.loaded) {
      status.textContent = "teachers.csv に直してほしいところがあります。直してから読み込み直してください。";
    } else {
      status.textContent = csv.source || "読み込み中……";
    }
    setErrors($("csv-errors"), csv.errors);
    var counts = L.countByCategory(csv.teachers);
    L.CATEGORIES.forEach(function (r) {
      $("count-" + r).textContent = csv.loaded && !csv.errors.length ? counts[r] : "–";
    });

    // 必要人数
    var req = L.calcRequired(CONFIG.classes, state.groups, CONFIG.categoryTable);
    L.CATEGORIES.forEach(function (r) {
      $("need-" + r).textContent = req.errors.length ? "–" : req.total[r];
    });
    var needErrors = req.errors.slice();
    var needWarnings = [];
    if (!req.errors.length && csv.loaded && !csv.errors.length) {
      var plan = L.planShortages(csv.teachers, req.total);
      needErrors = needErrors.concat(plan.errors);
      needWarnings = plan.warnings;
    }
    setErrors($("need-errors"), needErrors);
    setErrors($("need-warnings"), needWarnings);

    var canCreate = csv.loaded && !csv.errors.length && !needErrors.length;
    $("btn-create").disabled = !canCreate;

    // 割当の状態
    var as = $("assign-status");
    if (state.assignment) {
      as.innerHTML = "";
      as.appendChild(document.createTextNode("割当：作成済み（" + formatDate(state.createdAt) + "）"));
      if (!assignmentMatchesGroups()) {
        var w = document.createElement("div");
        w.className = "warn";
        w.textContent = "班数が変更されています。反映するには「割当を作成」をもう一度押してください。";
        as.appendChild(w);
      }
    } else {
      as.textContent = "割当：まだ作成していません";
    }

    // 授業を始める（クラス選択）
    var box = $("class-buttons");
    box.innerHTML = "";
    CONFIG.classes.forEach(function (c) {
      var btn = document.createElement("button");
      btn.className = "btn";
      var list = state.assignment && state.assignment[c.id];
      btn.disabled = !list;
      var label = document.createElement("span");
      label.textContent = c.name;
      btn.appendChild(label);
      if (list) {
        var done = (state.revealed[c.id] || []).filter(Boolean).length;
        var p = document.createElement("span");
        p.className = "progress";
        p.textContent = "くじ済み " + done + " / " + list.length + "班";
        btn.appendChild(p);
      }
      btn.addEventListener("click", function () {
        state.currentClass = c.id;
        showView("lottery");
      });
      box.appendChild(btn);
    });
    $("start-hint").textContent = state.assignment
      ? "クラスを選ぶと、くじの画面になります。"
      : "先に「割当を作成」をしてください。";
    $("btn-list").disabled = !state.assignment;
    renderRedraw();
    $("btn-save-file").disabled = !state.assignment;
  }

  function createAssignment() {
    if (state.assignment &&
        !confirm("今の抽選結果を消して、割当を作り直します。よろしいですか？")) {
      return;
    }
    var result = L.buildAssignment(csv.teachers, CONFIG.classes, state.groups, CONFIG.categoryTable);
    if (!result.ok) {
      setErrors($("need-errors"), result.errors);
      return;
    }
    state.assignment = result.assignment;
    state.revealed = {};
    state.currentGroup = {};
    CONFIG.classes.forEach(function (c) {
      state.revealed[c.id] = result.assignment[c.id].map(function () { return false; });
      state.currentGroup[c.id] = 0;
    });
    state.createdAt = new Date().toISOString();
    state.teachers = csv.teachers.slice();
    state.excluded = [];
    state.redrawLog = [];
    saveState();
    renderSetup();
  }

  function resetAll() {
    if (!confirm("すべての抽選結果を削除します。よろしいですか？")) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(BACKUP_KEY);
    } catch (e) { /* 保存できない環境 */ }
    state = defaultState();
    buildGroupInputs();
    showView("setup");
  }

  // ---------------- teachers.csv の読み込み ----------------
  function applyCsvText(text, source) {
    var parsed = L.parseTeachersCsv(text);
    csv = { loaded: true, teachers: parsed.teachers, errors: parsed.errors, source: source };
    renderSetup();
  }

  function loadCsvFromServer() {
    if (csvLoading) return;
    csvLoading = true;
    csv = { loaded: false, teachers: [], errors: [], source: "" };
    renderSetup();
    fetch(CSV_URL + "?t=" + Date.now(), { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error(res.status);
        return res.text();
      })
      .then(function (text) { csvLoading = false; applyCsvText(text, "data/teachers.csv "); })
      .catch(function () {
        csvLoading = false;
        csv.source = "下のボタンから teachers.csv を選んでください。" +
          "（iPad では「ファイル」の中から選べます）";
        renderSetup();
      });
  }

  $("csv-file").addEventListener("change", function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () { applyCsvText(String(reader.result), file.name + " "); };
    reader.onerror = function () {
      csv = { loaded: true, teachers: [], errors: ["ファイルを読み込めませんでした。"], source: "" };
      renderSetup();
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = ""; // 同じファイルをもう一度選べるように
  });

  $("btn-create").addEventListener("click", createAssignment);
  $("btn-reset").addEventListener("click", resetAll);
  $("btn-list").addEventListener("click", function () { showView("list"); });

  // ---------------- 途中経過の保存ファイル（ふっかつ用） ----------------
  var FILE_APP = "sensei-kuji";

  function pad2(n) { return String(n).padStart(2, "0"); }

  function saveToFile() {
    if (!state.assignment) return;
    var d = new Date();
    var data = {
      app: FILE_APP,
      version: 1,
      savedAt: d.toISOString(),
      classes: CONFIG.classes,
      groups: state.groups,
      assignment: state.assignment,
      revealed: state.revealed,
      currentGroup: state.currentGroup,
      currentClass: state.currentClass,
      createdAt: state.createdAt,
      teachers: state.teachers,
      excluded: state.excluded,
      redrawLog: state.redrawLog,
    };
    var name = "先生くじ保存_" + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
      "_" + pad2(d.getHours()) + pad2(d.getMinutes()) + ".json";
    var blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    $("file-status").textContent = "「" + name + "」を保存しました。";
  }

  // 保存ファイルの中身が正しいか確かめる。問題があれば日本語の理由を返す
  function checkSaveData(data) {
    if (!data || data.app !== FILE_APP || !data.assignment) return "先生くじの保存ファイルではありません。";
    var bad = CONFIG.classes.filter(function (c) {
      var list = data.assignment[c.id];
      var rev = data.revealed && data.revealed[c.id];
      return !Array.isArray(list) || !list.length ||
        list.some(function (n) { return typeof n !== "string"; }) ||
        !Array.isArray(rev) || rev.length !== list.length;
    });
    if (bad.length) return "保存ファイルの中身が壊れています（" + bad.map(function (c) { return c.name; }).join("・") + "）。";
    return "";
  }

  $("file-restore").addEventListener("change", function (e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var data = null;
      try { data = JSON.parse(String(reader.result)); } catch (err) { data = null; }
      var problem = checkSaveData(data);
      if (problem) { alert(problem); return; }
      var done = CONFIG.classes.reduce(function (sum, c) {
        return sum + data.revealed[c.id].filter(Boolean).length;
      }, 0);
      var msg = "保存ファイル（" + formatDate(data.savedAt) + " 保存・くじ済み " + done + "班）から元に戻します。\n" +
        "今の抽選結果は、この内容に置きかわります。よろしいですか？";
      if (!confirm(msg)) return;
      var s2 = defaultState();
      ["groups", "assignment", "revealed", "currentGroup", "currentClass", "createdAt", "teachers", "excluded", "redrawLog"].forEach(function (k) {
        if (data[k] !== undefined) s2[k] = data[k];
      });
      state = s2;
      if (!Array.isArray(state.excluded)) state.excluded = [];
      if (!Array.isArray(state.redrawLog)) state.redrawLog = [];
      if (Array.isArray(state.teachers) && state.teachers.length) {
        csv = { loaded: true, teachers: state.teachers, errors: [], source: "保存ファイルの先生データ " };
      }
      saveState();
      buildGroupInputs();
      showView("setup");
      $("file-status").textContent = "保存ファイルから元に戻しました。";
    };
    reader.readAsText(file, "UTF-8");
  });

  $("btn-save-file").addEventListener("click", saveToFile);

  // ---------------- 班の先生を引き直す ----------------
  var redrawClass = null;
  var redrawOpen = false; // 管理メニューは、ボタンを押すまで閉じておく
  var showHidden = false; // まだくじを引いていない班の結果を表示するか（保存しない。毎回 表示しない から始まる）

  function setRedrawOpen(open) {
    redrawOpen = open;
    renderRedraw();
  }

  // 先生名を見せてよい班か（くじ済み、または管理メニューで「表示する」にしているとき）
  function canShowName(classId, i) {
    return showHidden || (state.revealed[classId] || [])[i] === true;
  }
  function wasRedrawn(classId, i) {
    return state.redrawLog.some(function (r) { return r.classId === classId && r.group === i + 1; });
  }

  // カテゴリごとの人数を「A ○人・B ○人・C ○人」の形にする
  function countsText(list) {
    var c = L.countByCategory(list);
    return "A " + c.A + "人・B " + c.B + "人・C " + c.C + "人";
  }

  // 引き直しに使う先生データ
  //   ふだんは、割当作成時（または保存ファイル）の先生データを使う。
  //   teachers.csv を読み込み直していて、いま班に割り当てている先生が全員その中にいる場合だけ、
  //   読み込んだ CSV を使う（カテゴリの変更や先生の追加を反映できる）。
  //   名前が合わない CSV（別の名簿・ひな形など）は使わない。別の名簿から先生を選んでしまうため。
  function csvLoadedOk() {
    return csv.loaded && !csv.errors.length && csv.teachers.length > 0;
  }
  function csvMatchesAssignment() {
    if (!state.assignment) return false;
    var names = {};
    csv.teachers.forEach(function (t) { names[t.name] = true; });
    return CONFIG.classes.every(function (c) {
      return (state.assignment[c.id] || []).every(function (n) { return names[n]; });
    });
  }
  function csvUsable() {
    return csvLoadedOk() && csvMatchesAssignment();
  }
  function redrawTeachers() {
    if (csvUsable()) return csv.teachers;
    return Array.isArray(state.teachers) ? state.teachers : [];
  }

  function renderRedraw() {
    var panel = $("redraw-panel");
    panel.hidden = !state.assignment;
    if (!state.assignment) return;
    $("redraw-body").hidden = !redrawOpen;
    $("btn-redraw-toggle").textContent = redrawOpen ? "管理メニューを閉じる" : "管理メニューを開く";
    if (!redrawOpen) { $("redraw-groups").innerHTML = ""; return; }
    var teachers = redrawTeachers();
    $("chk-show-hidden").checked = showHidden;

    // 先生用の内訳（「表示する」にしているときだけ）
    var counts = $("admin-counts");
    counts.hidden = !(showHidden && teachers.length);
    if (!counts.hidden) {
      var byName = {};
      teachers.forEach(function (t) { byName[t.name] = t; });
      var assigned = [], unknown = 0;
      CONFIG.classes.forEach(function (c) {
        (state.assignment[c.id] || []).forEach(function (n) {
          if (byName[n]) assigned.push(byName[n]); else unknown++;
        });
      });
      counts.textContent = "いま班に割り当てている先生：" + countsText(assigned) +
        (unknown ? "（先生データにない名前 " + unknown + "人）" : "") +
        "　／　残っている先生：" + countsText(L.remainingTeachers(teachers, state.assignment, state.excluded));
    }

    var sel = $("redraw-class");
    if (!redrawClass) redrawClass = CONFIG.classes[0].id;
    if (!sel.options.length) {
      CONFIG.classes.forEach(function (c) {
        var o = document.createElement("option");
        o.value = c.id;
        o.textContent = c.name;
        sel.appendChild(o);
      });
    }
    sel.value = redrawClass;

    var rest = L.remainingTeachers(teachers, state.assignment, state.excluded).length;
    $("redraw-remaining").textContent = teachers.length
      ? "残っている先生：" + rest + "人" +
        "（" + (csvUsable() ? "読み込んだ " + csv.source.trim() : "割当を作ったときの先生データ") + "）" +
        (csvLoadedOk() && !csvUsable() ? "　※読み込んだ teachers.csv は、今の割当と先生名が合わないため使っていません。" : "")
      : "先生データがありません。割当を作ったときと同じ teachers.csv を「teachers.csv を選ぶ」で読み込んでください。";

    var ul = $("redraw-groups");
    ul.innerHTML = "";
    (state.assignment[redrawClass] || []).forEach(function (name, i) {
      var li = document.createElement("li");
      var label = document.createElement("label");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = i;
      var g = document.createElement("span");
      g.className = "g";
      g.textContent = (i + 1) + "班";
      var n = document.createElement("span");
      n.className = "n";
      // くじ前の班の先生名は出さない（管理メニューで「表示する」にしたときだけ出す）
      var hiddenName = !canShowName(redrawClass, i);
      n.className = hiddenName ? "n masked" : "n";
      n.textContent = hiddenName ? "？？？" : name;
      label.appendChild(cb);
      label.appendChild(g);
      label.appendChild(n);
      var mark = (state.revealed[redrawClass] || [])[i] ? "くじ済"
        : (wasRedrawn(redrawClass, i) ? "引き直し済・くじ前" : "くじ前");
      if (mark) {
        var d = document.createElement("span");
        d.className = "done";
        d.textContent = mark;
        label.appendChild(d);
      }
      li.appendChild(label);
      ul.appendChild(li);
    });
    $("btn-redraw").disabled = !teachers.length;
    $("btn-wizard").disabled = !teachers.length;
  }

  $("redraw-class").addEventListener("change", function (e) {
    redrawClass = e.target.value;
    setErrors($("redraw-errors"), []);
    $("redraw-status").textContent = "";
    renderRedraw();
  });

  $("btn-redraw-toggle").addEventListener("click", function () {
    $("redraw-status").textContent = "";
    setErrors($("redraw-errors"), []);
    if (redrawOpen) showHidden = false; // 閉じるときは、くじ前の結果も表示しない状態に戻す
    setRedrawOpen(!redrawOpen);
  });

  $("chk-show-hidden").addEventListener("change", function (e) {
    showHidden = e.target.checked;
    renderRedraw();
  });

  $("btn-redraw").addEventListener("click", function () {
    var indexes = Array.prototype.map.call(
      document.querySelectorAll("#redraw-groups input:checked"),
      function (cb) { return Number(cb.value); });
    var result = L.redraw(redrawTeachers(), state.assignment, state.excluded, redrawClass, indexes);
    if (!result.ok) { setErrors($("redraw-errors"), result.errors); return; }
    setErrors($("redraw-errors"), []);
    var groupsText = indexes.map(function (i) { return (i + 1) + "班"; }).join("・");
    if (!confirm(classLabel(redrawClass) + " の " + groupsText + " の先生を引き直します。\n" +
        "引き直した班は「くじ前」に戻ります。よろしいですか？")) return;
    var now = new Date().toISOString();
    result.changes.forEach(function (ch) {
      state.excluded.push(ch.from);
      state.revealed[redrawClass][ch.index] = false;
      state.redrawLog.push({ classId: redrawClass, group: ch.index + 1, from: ch.from, to: ch.to, at: now });
    });
    state.assignment = result.assignment;
    state.teachers = redrawTeachers().slice(); // 保存ファイルにも最新の先生データを残す
    saveState();
    redrawOpen = false; // 引き直したら管理メニューを閉じる
    showHidden = false;
    renderSetup();
    // 新しい先生の名前はここでは出さない（くじ画面で発表するため）
    $("redraw-status").textContent = classLabel(redrawClass) + " の " + groupsText +
      " を引き直しました。くじ画面でもう一度くじを引いてください。";
  });

  // ---------------- 先生をしぼって引き直す（ウィザード） ----------------
  //   ① 引き直す班を選ぶ（くじ前の班は最初から選んである）
  //   ② 出てくる可能性のある先生を選ぶ（①で選んだ班の数以上）
  //   ③ 確認して実行（選んだ先生の中からランダムに割り当てる）
  var wiz = { step: 1, targets: {}, pool: {} };

  function wizTargets() {
    var list = [];
    CONFIG.classes.forEach(function (c) {
      (state.assignment[c.id] || []).forEach(function (_, i) {
        if (wiz.targets[c.id + ":" + i]) list.push({ classId: c.id, index: i });
      });
    });
    return list;
  }
  function wizCandidates() {
    return L.poolCandidates(redrawTeachers(), state.assignment, wizTargets());
  }
  function wizPoolNames() {
    return wizCandidates().map(function (t) { return t.name; })
      .filter(function (n) { return wiz.pool[n]; });
  }

  function openWizard() {
    wiz = { step: 1, targets: {}, pool: {} };
    CONFIG.classes.forEach(function (c) { // くじ前の班を最初から選んでおく
      (state.assignment[c.id] || []).forEach(function (_, i) {
        if (!(state.revealed[c.id] || [])[i]) wiz.targets[c.id + ":" + i] = true;
      });
    });
    $("wizard").hidden = false;
    renderWizard();
  }
  function closeWizard() {
    $("wizard").hidden = true;
    $("wiz-main").innerHTML = "";
  }

  function wizCheckItem(checked, onChange, parts) {
    var li = document.createElement("li");
    var label = document.createElement("label");
    if (checked) label.className = "checked";
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = checked;
    cb.addEventListener("change", function () { onChange(cb.checked); });
    label.appendChild(cb);
    parts.forEach(function (pt) {
      var sp = document.createElement("span");
      sp.className = pt[0];
      sp.textContent = pt[1];
      label.appendChild(sp);
    });
    li.appendChild(label);
    return li;
  }
  function wizToolButton(text, fn) {
    var b = document.createElement("button");
    b.className = "btn small-btn";
    b.textContent = text;
    b.addEventListener("click", fn);
    $("wiz-tools").appendChild(b);
  }

  function renderWizard() {
    var main = $("wiz-main");
    main.innerHTML = "";
    $("wiz-tools").innerHTML = "";
    setErrors($("wiz-errors"), []);
    [1, 2, 3].forEach(function (n) { $("wiz-s" + n).className = wiz.step === n ? "on" : ""; });
    var targets = wizTargets();
    var need = targets.length;
    var count = $("wiz-count");
    count.className = "wiz-count";
    $("wiz-back").hidden = wiz.step === 1;

    if (wiz.step === 1) {
      $("wiz-title").textContent = "① 引き直す班を選ぶ";
      $("wiz-lead").textContent = "まだくじを引いていない班は、最初から選んであります。" +
        "くじ済みの班を選ぶと、その班は「くじ前」に戻ります。";
      wizToolButton("くじ前の班だけ選ぶ", openWizard);
      wizToolButton("すべて外す", function () { wiz.targets = {}; renderWizard(); });
      CONFIG.classes.forEach(function (c) {
        var h = document.createElement("h3");
        h.textContent = c.name;
        main.appendChild(h);
        var ul = document.createElement("ul");
        ul.className = "wiz-grid";
        (state.assignment[c.id] || []).forEach(function (name, i) {
          var key = c.id + ":" + i;
          var drawn = (state.revealed[c.id] || [])[i] === true;
          var show = canShowName(c.id, i);
          ul.appendChild(wizCheckItem(!!wiz.targets[key], function (on) {
            if (on) wiz.targets[key] = true; else delete wiz.targets[key];
            renderWizard();
          }, [["g", (i + 1) + "班"], [show ? "n" : "n masked", show ? name : "？？？"],
              ["sub", drawn ? "くじ済" : "くじ前"]]));
        });
        main.appendChild(ul);
      });
      count.textContent = "選んだ班：" + need + "班";
      $("wiz-next").textContent = "次へ";
      $("wiz-next").disabled = need === 0;
      return;
    }

    var candidates = wizCandidates();
    var poolNames = wizPoolNames();

    if (wiz.step === 2) {
      $("wiz-title").textContent = "② 出てくる可能性のある先生を選ぶ";
      $("wiz-lead").textContent = "ここで選んだ先生の中から、" + need + "班分をランダムに引き直します。" +
        need + "人以上選んでください。（ほかの班にすでに決まっている先生は出てきません）";
      wizToolButton("すべて選ぶ", function () {
        candidates.forEach(function (t) { wiz.pool[t.name] = true; });
        renderWizard();
      });
      wizToolButton("すべて外す", function () { wiz.pool = {}; renderWizard(); });
      L.CATEGORIES.forEach(function (cat) {
        var inCat = candidates.filter(function (t) { return t.category === cat; });
        if (!inCat.length) return;
        var h = document.createElement("h3");
        h.textContent = cat + "（" + inCat.length + "人）";
        main.appendChild(h);
        var ul = document.createElement("ul");
        ul.className = "wiz-grid";
        inCat.forEach(function (t) {
          var parts = [["n", t.name]];
          if (state.excluded.indexOf(t.name) !== -1) parts.push(["sub", "以前外した先生"]);
          ul.appendChild(wizCheckItem(!!wiz.pool[t.name], function (on) {
            if (on) wiz.pool[t.name] = true; else delete wiz.pool[t.name];
            renderWizard();
          }, parts));
        });
        main.appendChild(ul);
      });
      if (!candidates.length) {
        main.textContent = "選べる先生がいません。teachers.csv に先生を追加して読み込み直してください。";
      }
      count.textContent = "選んだ先生：" + poolNames.length + "人（最低 " + need + "人）";
      if (poolNames.length < need) count.classList.add("ng");
      $("wiz-next").textContent = "次へ";
      $("wiz-next").disabled = poolNames.length < need;
      return;
    }

    // ③ 確認
    $("wiz-title").textContent = "③ 確認";
    $("wiz-lead").textContent = "この内容で引き直します。どの班にどの先生が入るかは、くじ画面でくじを引くまで表示されません。";
    var ul3 = document.createElement("ul");
    ul3.className = "wiz-summary";
    var byClass = CONFIG.classes.map(function (c) {
      var gs = targets.filter(function (t) { return t.classId === c.id; })
        .map(function (t) { return (t.index + 1) + "班"; });
      return gs.length ? c.name + "：" + gs.join("・") : "";
    }).filter(Boolean);
    [["引き直す班（" + need + "班）", byClass.join("　／　")],
     ["出てくる可能性のある先生（" + poolNames.length + "人）", poolNames.join("、")],
     ["選ばれ方", "上の先生の中からランダムに " + need + "人が選ばれ、1人ずつ班に入ります。" +
        (poolNames.length > need ? "（" + (poolNames.length - need) + "人は選ばれません）" : "（全員が選ばれます）")]
    ].forEach(function (row) {
      var li = document.createElement("li");
      var b = document.createElement("b");
      b.textContent = row[0] + "：";
      li.appendChild(b);
      li.appendChild(document.createTextNode(row[1]));
      ul3.appendChild(li);
    });
    main.appendChild(ul3);
    count.textContent = "";
    $("wiz-next").textContent = "この内容で引き直す";
    $("wiz-next").disabled = false;
  }

  function runWizard() {
    var targets = wizTargets();
    var result = L.redrawFromPool(state.assignment, targets, wizPoolNames());
    if (!result.ok) { setErrors($("wiz-errors"), result.errors); return; }
    var now = new Date().toISOString();
    var pool = wizPoolNames();
    result.changes.forEach(function (ch) {
      // 児童がすでに見た先生（くじ済みだった班の先生）は、自動の引き直しではもう選ばない
      var wasDrawn = (state.revealed[ch.classId] || [])[ch.index] === true;
      if (wasDrawn && ch.from !== ch.to && state.excluded.indexOf(ch.from) === -1) state.excluded.push(ch.from);
      state.revealed[ch.classId][ch.index] = false;
      state.redrawLog.push({ classId: ch.classId, group: ch.index + 1, from: ch.from, to: ch.to, at: now, pool: pool });
    });
    // 自分で選んだ先生は「外した先生」から戻す
    state.excluded = state.excluded.filter(function (n) { return pool.indexOf(n) === -1; });
    state.assignment = result.assignment;
    state.teachers = redrawTeachers().slice();
    saveState();
    closeWizard();
    redrawOpen = false;
    showHidden = false;
    renderSetup();
    $("redraw-status").textContent = targets.length +
      "班を引き直しました。くじ画面でもう一度くじを引いてください。";
  }

  $("btn-wizard").addEventListener("click", openWizard);
  $("wiz-cancel").addEventListener("click", closeWizard);
  $("wiz-back").addEventListener("click", function () { wiz.step = Math.max(1, wiz.step - 1); renderWizard(); });
  $("wiz-next").addEventListener("click", function () {
    if (wiz.step < 3) { wiz.step++; renderWizard(); return; }
    runWizard();
  });

  // ================================================================
  //  結果一覧（スクリーンショット用）
  // ================================================================
  function renderList() {
    if (!state.assignment) { showView("setup"); return; }
    $("list-date").textContent = "割当作成：" + formatDate(state.createdAt);
    var grid = $("list-grid");
    grid.innerHTML = "";
    var maxRows = 0;
    CONFIG.classes.forEach(function (c) {
      var list = state.assignment[c.id] || [];
      var rev = state.revealed[c.id] || [];
      maxRows = Math.max(maxRows, list.length);
      var col = document.createElement("div");
      col.className = "list-col";
      var h = document.createElement("h2");
      h.textContent = c.name;
      col.appendChild(h);
      var ol = document.createElement("ol");
      list.forEach(function (name, i) {
        var li = document.createElement("li");
        var masked = !canShowName(c.id, i); // くじ前の班は、管理メニューで「表示する」にしたときだけ名前を出す
        if (!rev[i]) li.className = masked ? "not-drawn masked" : "not-drawn";
        var g = document.createElement("span");
        g.className = "g";
        g.textContent = (i + 1) + "班";
        var n = document.createElement("span");
        n.className = !masked && name.length > 8 ? "n long" : "n"; // 長い名前は少し小さく
        n.textContent = masked ? "（くじ前）" : name;
        li.appendChild(g);
        li.appendChild(n);
        if (!rev[i] && !masked) {
          var tag = document.createElement("span");
          tag.className = "tag";
          tag.textContent = "くじ前";
          n.appendChild(tag);
        }
        ol.appendChild(li);
      });
      col.appendChild(ol);
      grid.appendChild(col);
    });
    grid.style.setProperty("--rows", maxRows);
    var notDrawn = grid.querySelectorAll(".not-drawn").length;
    $("list-note").textContent = !notDrawn ? ""
      : showHidden ? "「くじ前」＝まだくじを引いていない班（先生はこの表のとおりに決まっています）"
      : "まだくじを引いていない班の先生は表示していません（準備画面の「管理メニュー」で表示できます）";
  }

  $("btn-list-back").addEventListener("click", function () { showView("setup"); });

  // ================================================================
  //  くじ画面
  // ================================================================
  var drawing = false;

  function currentList() {
    return (state.assignment && state.assignment[state.currentClass]) || [];
  }
  function currentIndex() {
    var list = currentList();
    var i = state.currentGroup[state.currentClass] || 0;
    return Math.max(0, Math.min(i, list.length - 1));
  }

  function classLabel(id) {
    var c = CONFIG.classes.filter(function (x) { return x.id === id; })[0];
    return c ? c.name : "";
  }

  function renderLottery() {
    var list = currentList();
    if (!list.length) { showView("setup"); return; }
    var i = currentIndex();
    var revealed = (state.revealed[state.currentClass] || [])[i] === true;
    var groupName = (i + 1) + "班";

    $("lot-class").textContent = classLabel(state.currentClass);
    $("lot-group").textContent = groupName;
    $("res-group").textContent = groupName;

    $("state-ready").hidden = revealed || drawing;
    $("state-wait").hidden = !drawing;
    $("state-result").hidden = !revealed || drawing;

    if (revealed) {
      var text = list[i] + "！";
      var nameEl = $("res-name");
      nameEl.textContent = text;
      nameEl.style.setProperty("--len", Math.max(text.length, 4));
    }

    $("btn-prev").disabled = drawing || i === 0;
    $("btn-next").disabled = drawing || i >= list.length - 1;
    $("btn-back").disabled = drawing;
  }

  function draw() {
    var list = currentList();
    var i = currentIndex();
    if (drawing || !list.length || state.revealed[state.currentClass][i]) return;
    // 押した瞬間に保存する（演出中に再読み込みされても結果は消えない）
    state.revealed[state.currentClass][i] = true;
    saveState();
    drawing = true;
    renderLottery();
    setTimeout(function () {
      drawing = false;
      renderLottery();
    }, CONFIG.revealDelayMs);
  }

  function move(step) {
    if (drawing) return;
    var list = currentList();
    var next = currentIndex() + step;
    if (next < 0 || next >= list.length) return;
    state.currentGroup[state.currentClass] = next;
    saveState();
    renderLottery();
  }

  // クリック後にボタンのフォーカスを外す（キーボード操作と二重に動かないように）
  function onClick(id, fn) {
    $(id).addEventListener("click", function (e) { e.currentTarget.blur(); fn(); });
  }
  onClick("btn-draw", draw);
  onClick("btn-prev", function () { move(-1); });
  onClick("btn-next", function () { move(1); });
  onClick("btn-back", function () { if (!drawing) showView("setup"); });

  // キーボード操作（電子黒板のリモコン・PC用）: Enter/スペース=くじ、←→=班の移動
  document.addEventListener("keydown", function (e) {
    if (state.view !== "lottery" || e.target.tagName === "BUTTON") return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); draw(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); move(1); }
  });

  // ---------------- 起動 ----------------
  // ブラウザに「このサイトの保存データを消さないで」と頼む（対応ブラウザのみ）
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(function () {});
  }
  // 通信が切れても再読み込みできるように、画面のファイルを端末に保存しておく
  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
  buildGroupInputs();
  showView(state.view);
})();
