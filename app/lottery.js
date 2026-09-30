// CSV読み込みと割当作成のロジック（画面には関係しない部分）
// ブラウザでは window.Lottery、Node（テスト）では module.exports として使う。
(function (root) {
  "use strict";

  var CATEGORIES = ["A", "B", "C"];

  // 1列分の値を整える：前後の空白を除去し、"..." で囲まれていれば外す
  function cleanField(value) {
    var v = (value || "").trim();
    if (v.length >= 2 && v.charAt(0) === '"' && v.charAt(v.length - 1) === '"') {
      v = v.slice(1, -1).replace(/""/g, '"').trim();
    }
    return v;
  }

  // teachers.csv（name,category の2列）を読む
  // 戻り値: { teachers: [{name, category}], errors: ["日本語のエラー文", ...] }
  function parseTeachersCsv(text) {
    var errors = [];
    var teachers = [];
    if (typeof text !== "string") text = "";
    text = text.replace(/^﻿/, ""); // BOM を除去

    if (text.indexOf("�") !== -1) {
      return {
        teachers: [],
        errors: ["文字化けしています。teachers.csv を「UTF-8」で保存し直してください。"],
      };
    }

    var lines = text.split(/\r\n|\n|\r/);
    var headerFound = false;
    var seen = {}; // name -> 行番号

    for (var i = 0; i < lines.length; i++) {
      var lineNo = i + 1;
      if (lines[i].trim() === "") continue; // 空行は無視

      var cols = lines[i].split(",").map(cleanField);
      // 行末の余分な空の列（Excel で付くことがある）は無視
      while (cols.length > 2 && cols[cols.length - 1] === "") cols.pop();

      if (!headerFound) {
        headerFound = true;
        // 2列目の見出しは category（旧形式の rank、group も可）
        if (cols.length === 2 && cols[0].toLowerCase() === "name" &&
            ["category", "group", "rank"].indexOf(cols[1].toLowerCase()) !== -1) {
          continue;
        }
        errors.push(lineNo + "行目：1行目（見出し）は「name,category」にしてください。");
        continue;
      }

      if (cols.length !== 2) {
        errors.push(lineNo + "行目：「名前,カテゴリ」の2つだけを書いてください。（" + lines[i].trim() + "）");
        continue;
      }

      var name = cols[0];
      // 全角Ａ・小文字 a なども A として扱う
      var category = cols[1].normalize ? cols[1].normalize("NFKC").toUpperCase() : cols[1].toUpperCase();

      if (name === "") {
        errors.push(lineNo + "行目：先生の名前が空欄です。");
        continue;
      }
      if (category === "") {
        errors.push(lineNo + "行目：「" + name + "」のカテゴリが空欄です。A・B・C のどれかを書いてください。");
        continue;
      }
      if (CATEGORIES.indexOf(category) === -1) {
        errors.push(lineNo + "行目：「" + name + "」のカテゴリ「" + cols[1] + "」は使えません。A・B・C のどれかにしてください。");
        continue;
      }
      if (seen[name]) {
        errors.push(lineNo + "行目：「" + name + "」が重複しています（" + seen[name] + "行目と同じ名前）。");
        continue;
      }
      seen[name] = lineNo;
      teachers.push({ name: name, category: category });
    }

    if (!headerFound) {
      errors.push("teachers.csv が空です。");
    } else if (teachers.length === 0 && errors.length === 0) {
      errors.push("teachers.csv に先生が1人も登録されていません。");
    }
    return { teachers: teachers, errors: errors };
  }

  // カテゴリごとの人数を数える
  function countByCategory(teachers) {
    var c = { A: 0, B: 0, C: 0 };
    teachers.forEach(function (t) { c[t.category]++; });
    return c;
  }

  // 3クラス分の必要人数を計算する
  // groupsByClass: { classId: 班数 }
  // 戻り値: { total: {A,B,C}, perClass: {classId: {A,B,C}}, errors: [] }
  function calcRequired(classes, groupsByClass, categoryTable) {
    var total = { A: 0, B: 0, C: 0 };
    var perClass = {};
    var errors = [];
    classes.forEach(function (cls) {
      var n = groupsByClass[cls.id];
      var row = categoryTable[n];
      if (!row) {
        errors.push(cls.name + "：" + n + "班の配分が設定にありません（config.js の categoryTable を確認してください）。");
        return;
      }
      perClass[cls.id] = { A: row.A, B: row.B, C: row.C };
      CATEGORIES.forEach(function (r) { total[r] += row[r]; });
    });
    return { total: total, perClass: perClass, errors: errors };
  }

  // カテゴリが足りないときに、代わりに使うカテゴリの順番
  //   A が足りない → B、C の順で補う（なるべく近いカテゴリから）
  var FALLBACK = { A: ["B", "C"], B: ["A", "C"], C: ["B", "A"] };

  // 先生の人数と必要人数から、足りないカテゴリの補い方を決める
  // 戻り値: {
  //   take:   {A,B,C}             各カテゴリから本来の枠に入れる人数
  //   borrow: {A: {B: 3}, ...}    足りない枠に、どのカテゴリから何人入れるか
  //   warnings: ["…"]             カテゴリ不足の警告（割当は作れる）
  //   errors:   ["…"]             合計人数の不足（割当は作れない）
  // }
  function planShortages(teachers, total) {
    var have = countByCategory(teachers);
    var take = {}, spare = {}, borrow = {};
    var warnings = [], errors = [];
    CATEGORIES.forEach(function (r) {
      take[r] = Math.min(have[r], total[r]);
      spare[r] = have[r] - take[r];
    });

    var need = total.A + total.B + total.C;
    var count = have.A + have.B + have.C;
    if (count < need) {
      errors.push("先生の人数が合計" + (need - count) + "人足りません（班の数：" + need +
        "、先生：" + count + "人）。先生を増やすか、班数を減らしてください。");
      return { take: take, borrow: borrow, warnings: warnings, errors: errors };
    }

    CATEGORIES.forEach(function (r) {
      var short = total[r] - take[r];
      if (short <= 0) return;
      borrow[r] = {};
      var used = [];
      FALLBACK[r].forEach(function (from) {
        var n = Math.min(short, spare[from]);
        if (n <= 0) return;
        borrow[r][from] = n;
        spare[from] -= n;
        short -= n;
        used.push(from + "カテゴリの先生" + n + "人");
      });
      warnings.push(r + "カテゴリの先生が" + (total[r] - take[r]) + "人足りません → " +
        used.join("と") + "で代わりに割り当てます" +
        (borrow[r].C ? "（Cの先生が2人以上になるクラスが出ます。teachers.csv で A・B の先生を増やすのがおすすめです）" : ""));
    });
    return { take: take, borrow: borrow, warnings: warnings, errors: errors };
  }

  // Fisher–Yates シャッフル（元の配列は変更しない）
  function shuffle(list, rng) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  // 3クラス全体の割当を一度に作る
  // 戻り値: { ok: true, assignment: { classId: ["先生名", ...] }, warnings: [...] }
  //      または { ok: false, errors: [...] }
  function buildAssignment(teachers, classes, groupsByClass, categoryTable, rng) {
    rng = rng || Math.random;
    var req = calcRequired(classes, groupsByClass, categoryTable);
    if (req.errors.length) return { ok: false, errors: req.errors };
    var plan = planShortages(teachers, req.total);
    if (plan.errors.length) return { ok: false, errors: plan.errors };

    // カテゴリ内でシャッフルし、必要人数分だけ選ぶ（残りは不足分の補充用）
    var slots = {}, rest = {};
    CATEGORIES.forEach(function (r) {
      var inCategory = shuffle(teachers.filter(function (t) { return t.category === r; }), rng);
      slots[r] = inCategory.slice(0, plan.take[r]);
      rest[r] = inCategory.slice(plan.take[r]);
    });
    // 足りないカテゴリの枠に、ほかのカテゴリの先生を入れる（枠の最後に置く）
    CATEGORIES.forEach(function (r) {
      var from = plan.borrow[r] || {};
      Object.keys(from).forEach(function (f) {
        slots[r] = slots[r].concat(rest[f].splice(0, from[f]));
      });
    });

    // 枠をクラスに配る。1班目から順にクラスを交互に回るので、
    // 補充した先生（枠の最後）は特定のクラスに偏らない
    // クラスの順番はカテゴリごとにずらして回す（補充の先生が同じクラスに重ならないように）
    var picked = {};
    classes.forEach(function (cls) { picked[cls.id] = []; });
    var base = shuffle(classes, rng);
    var start = 0;
    CATEGORIES.forEach(function (r) {
      var order = base.slice(start).concat(base.slice(0, start));
      start = (start + slots[r].length) % base.length;
      var list = slots[r];
      for (var round = 0; list.length && round < 1000; round++) {
        order.forEach(function (cls) {
          if (list.length && round < req.perClass[cls.id][r]) picked[cls.id].push(list.shift());
        });
      }
    });

    // 各クラス内で A/B/C を混ぜて再シャッフル
    var assignment = {};
    classes.forEach(function (cls) {
      assignment[cls.id] = shuffle(picked[cls.id], rng).map(function (t) { return t.name; });
    });
    return { ok: true, assignment: assignment, warnings: plan.warnings };
  }

  // まだどの班にも割り当てられていない先生を数える（引き直し用）
  // excluded: 引き直しで外した先生（もう一度選ばれないようにする）
  function remainingTeachers(teachers, assignment, excluded) {
    var used = {};
    Object.keys(assignment || {}).forEach(function (id) {
      (assignment[id] || []).forEach(function (n) { used[n] = true; });
    });
    (excluded || []).forEach(function (n) { used[n] = true; });
    return teachers.filter(function (t) { return !used[t.name]; });
  }

  // 選んだ班の先生を、残っている先生の中から選び直す
  //   indexes: 班の番号(0始まり)の配列
  //   A・B の先生から選ぶ。A・B が足りないときだけ、足りない分を C から選ぶ。
  // 戻り値: { ok: true, assignment: 新しい割当, changes: [{index, from, to}] }
  //      または { ok: false, errors: [...] }
  function redraw(teachers, assignment, excluded, classId, indexes, rng) {
    rng = rng || Math.random;
    if (!indexes.length) return { ok: false, errors: ["引き直す班を選んでください。"] };
    var rest = remainingTeachers(teachers, assignment, excluded);
    var first = shuffle(rest.filter(function (t) { return t.category !== "C"; }), rng);
    var second = shuffle(rest.filter(function (t) { return t.category === "C"; }), rng);
    var pool = first.concat(second);
    if (pool.length < indexes.length) {
      return { ok: false, errors: ["残っている先生が" + pool.length + "人しかいないため、" +
        indexes.length + "班分を引き直せません。"] };
    }
    // 選ばれた先生を班にランダムに配る
    var picked = shuffle(pool.slice(0, indexes.length), rng);
    var next = {};
    Object.keys(assignment).forEach(function (id) { next[id] = assignment[id].slice(); });
    var changes = indexes.map(function (i, k) {
      var from = next[classId][i];
      next[classId][i] = picked[k].name;
      return { index: i, from: from, to: picked[k].name };
    });
    return { ok: true, assignment: next, changes: changes };
  }

  var api = {
    CATEGORIES: CATEGORIES,
    parseTeachersCsv: parseTeachersCsv,
    countByCategory: countByCategory,
    calcRequired: calcRequired,
    planShortages: planShortages,
    shuffle: shuffle,
    buildAssignment: buildAssignment,
    remainingTeachers: remainingTeachers,
    redraw: redraw,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Lottery = api;
  }
})(this);
