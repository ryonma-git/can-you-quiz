// 抽選ロジックのテスト（node tests/run-tests.js で実行）
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");
const L = require("../app/lottery.js");

// config.js を読み込む（ブラウザ用なので window を用意して実行）
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../app/config.js"), "utf8"), sandbox);
const CONFIG = sandbox.window.KUJI_CONFIG;

const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
const groups = (a, b, c) => ({ "5-1": a, "5-2": b, "5-3": c });
let failed = 0;
function test(name, fn) {
  try { fn(); console.log("✔ " + name); }
  catch (e) { failed++; console.log("✘ " + name + "\n   " + e.message); }
}

const main = L.parseTeachersCsv(read("../data/teachers.sample.csv"));

test("Test 1: 9班×3クラスの必要人数が A18 / B6 / C3", () => {
  const req = L.calcRequired(CONFIG.classes, groups(9, 9, 9), CONFIG.categoryTable);
  assert.deepStrictEqual(req.errors, []);
  assert.deepStrictEqual(req.total, { A: 18, B: 6, C: 3 });
});

test("配分表: どの班数でも A+B+C = 班数", () => {
  Object.keys(CONFIG.categoryTable).forEach((n) => {
    const r = CONFIG.categoryTable[n];
    assert.strictEqual(r.A + r.B + r.C, Number(n), n + "班の合計が合いません");
  });
});

test("Test 2: 3クラスを通じて同じ先生が2回出ない（1000回試行・班数いろいろ）", () => {
  assert.deepStrictEqual(main.errors, []);
  const byName = Object.fromEntries(main.teachers.map((t) => [t.name, t.category]));
  for (let k = 0; k < 1000; k++) {
    const g = groups(6 + (k % 5), 6 + ((k + 2) % 5), 6 + ((k + 4) % 5));
    const res = L.buildAssignment(main.teachers, CONFIG.classes, g, CONFIG.categoryTable);
    assert.ok(res.ok, JSON.stringify(res.errors));
    const all = Object.values(res.assignment).flat();
    assert.strictEqual(new Set(all).size, all.length, "重複あり");
    // 各クラスの人数とカテゴリ配分が表どおりか
    CONFIG.classes.forEach((c) => {
      const list = res.assignment[c.id];
      assert.strictEqual(list.length, g[c.id]);
      const cnt = { A: 0, B: 0, C: 0 };
      list.forEach((n) => cnt[byName[n]]++);
      assert.deepStrictEqual(cnt, { ...CONFIG.categoryTable[g[c.id]] });
    });
  }
});

test("Test 3: クラス内の順番でカテゴリが混ざる（固定順にならない）", () => {
  const byName = Object.fromEntries(main.teachers.map((t) => [t.name, t.category]));
  const patterns = new Set();
  const firstRank = { A: 0, B: 0, C: 0 };
  const lastRank = { A: 0, B: 0, C: 0 };
  for (let k = 0; k < 500; k++) {
    const res = L.buildAssignment(main.teachers, CONFIG.classes, groups(9, 9, 9), CONFIG.categoryTable);
    const ranks = res.assignment["5-1"].map((n) => byName[n]);
    patterns.add(ranks.join(""));
    firstRank[ranks[0]]++;
    lastRank[ranks[ranks.length - 1]]++;
  }
  // 9班(A6,B2,C1)の並び方は 252 通り。500回で十分ばらつくはず
  assert.ok(patterns.size > 100, "並びのパターンが少なすぎます: " + patterns.size);
  ["A", "B", "C"].forEach((r) => {
    assert.ok(firstRank[r] > 0, "1班が" + r + "になることがない");
    assert.ok(lastRank[r] > 0, "最後の班が" + r + "になることがない");
  });
  console.log("   例:", [...patterns].slice(0, 5).join(" / "), "（全" + patterns.size + "パターン）");
});

function checkAssignment(res, teachers, g) {
  assert.ok(res.ok, JSON.stringify(res.errors));
  const all = Object.values(res.assignment).flat();
  assert.strictEqual(new Set(all).size, all.length, "重複あり");
  const names = new Set(teachers.map((t) => t.name));
  all.forEach((n) => assert.ok(names.has(n), "CSVにない先生: " + n));
  CONFIG.classes.forEach((c) => assert.strictEqual(res.assignment[c.id].length, g[c.id]));
}

test("Test 6: カテゴリが足りなくても、警告を出して割当を作る（A不足→Bで補う）", () => {
  const p = L.parseTeachersCsv(read("fixtures/category-short.csv")); // A15 B10 C5
  assert.deepStrictEqual(p.errors, []);
  const byName = Object.fromEntries(p.teachers.map((t) => [t.name, t.category]));
  const perClassB = { "5-1": 0, "5-2": 0, "5-3": 0 };
  for (let k = 0; k < 300; k++) {
    const g = groups(9, 9, 9);
    const res = L.buildAssignment(p.teachers, CONFIG.classes, g, CONFIG.categoryTable);
    checkAssignment(res, p.teachers, g);
    assert.deepStrictEqual(res.warnings, ["Aカテゴリの先生が3人足りません → Bカテゴリの先生3人で代わりに割り当てます"]);
    // A は全員使い、B は 6+3=9人。補充の3人は各クラスに1人ずつ
    const all = Object.values(res.assignment).flat();
    assert.strictEqual(all.filter((n) => byName[n] === "A").length, 15);
    assert.strictEqual(all.filter((n) => byName[n] === "B").length, 9);
    CONFIG.classes.forEach((c) => {
      const b = res.assignment[c.id].filter((n) => byName[n] === "B").length;
      assert.strictEqual(b, 3, c.name + " の B が " + b + "人");
    });
  }
  console.log("   警告:", L.planShortages(p.teachers, { A: 18, B: 6, C: 3 }).warnings.join(" / "));
});

test("Test 6b: 複数カテゴリが足りない場合もすべて警告して割当を作る", () => {
  const p = L.parseTeachersCsv(read("fixtures/multi-short.csv")); // A22 B4 C1
  const g = groups(9, 9, 9);
  const res = L.buildAssignment(p.teachers, CONFIG.classes, g, CONFIG.categoryTable);
  checkAssignment(res, p.teachers, g);
  assert.deepStrictEqual(res.warnings, [
    "Bカテゴリの先生が2人足りません → Aカテゴリの先生2人で代わりに割り当てます",
    "Cカテゴリの先生が2人足りません → Aカテゴリの先生2人で代わりに割り当てます",
  ]);
  res.warnings.forEach((w) => console.log("   " + w));
});

test("Test 6c: 先生の合計が班の数より少ないときは、作れない理由を表示する", () => {
  const p = L.parseTeachersCsv(read("fixtures/shortage.csv")); // 合計23人
  const res = L.buildAssignment(p.teachers, CONFIG.classes, groups(9, 9, 9), CONFIG.categoryTable);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.assignment, undefined);
  assert.ok(res.errors[0].includes("合計4人足りません"), res.errors[0]);
  console.log("   表示:", res.errors[0]);
});

test("Test 7: BOM・空行・前後の空白・CRLF があっても読める", () => {
  const p = L.parseTeachersCsv(read("fixtures/messy.csv"));
  assert.deepStrictEqual(p.errors, []);
  assert.deepStrictEqual(p.teachers, [
    { name: "山田先生", category: "A" },
    { name: "田中先生", category: "A" },
    { name: "佐藤先生", category: "B" },
    { name: "鈴木先生", category: "C" },
  ]);
});

test("Test 8: 不正なカテゴリ・名前なし・重複をエラーにする", () => {
  const p = L.parseTeachersCsv(read("fixtures/invalid.csv"));
  p.errors.forEach((e) => console.log("   " + e));
  assert.strictEqual(p.errors.length, 4);
  assert.ok(p.errors[0].includes("3行目") && p.errors[0].includes("「D」は使えません"));
  assert.ok(p.errors[1].includes("4行目") && p.errors[1].includes("名前が空欄"));
  assert.ok(p.errors[2].includes("5行目") && p.errors[2].includes("重複") && p.errors[2].includes("2行目"));
  assert.ok(p.errors[3].includes("6行目") && p.errors[3].includes("カテゴリが空欄"));
});

test("その他: 見出し行の誤り・文字化け(Shift_JIS)を知らせる", () => {
  assert.ok(L.parseTeachersCsv("名前,カテゴリ\n山田先生,A\n").errors[0].includes("name,category"));
  assert.ok(L.parseTeachersCsv("name,category\n��,A\n").errors[0].includes("UTF-8"));
  assert.ok(L.parseTeachersCsv("").errors[0].includes("空"));
});

test("引き直し: A・Bから自動で選び、A・Bがいないときだけ C。外した先生は二度と選ばれない", () => {
  const p = L.parseTeachersCsv(read("../data/teachers.sample.csv")); // A21 B10 C5
  const byName = Object.fromEntries(p.teachers.map((t) => [t.name, t.category]));
  const res = L.buildAssignment(p.teachers, CONFIG.classes, groups(9, 9, 9), CONFIG.categoryTable);
  let assignment = res.assignment;
  let excluded = [];
  const before = JSON.stringify(assignment);
  // 残り: A3 B4 C2（A21-18, B10-6, C5-3）
  const r1 = L.redraw(p.teachers, assignment, excluded, "5-3", [0, 1]);
  assert.ok(r1.ok, JSON.stringify(r1.errors));
  assert.strictEqual(JSON.stringify(assignment), before, "元の割当が変わってしまった");
  r1.changes.forEach((ch) => assert.ok(["A", "B"].includes(byName[ch.to]), "A・Bが残っているのにCが選ばれた"));
  assert.deepStrictEqual(r1.assignment["5-1"], assignment["5-1"], "他クラスが変わった");
  assert.deepStrictEqual(r1.assignment["5-3"].slice(2), assignment["5-3"].slice(2), "選んでいない班が変わった");
  excluded = excluded.concat(r1.changes.map((c) => c.from));
  assignment = r1.assignment;
  // 残り A・B は5人。6班分引き直すと 5人がA・B、1人だけ C
  const r2 = L.redraw(p.teachers, assignment, excluded, "5-1", [0, 1, 2, 3, 4, 5]);
  assert.ok(r2.ok, JSON.stringify(r2.errors));
  const cats = r2.changes.map((ch) => byName[ch.to]);
  assert.strictEqual(cats.filter((c) => c === "C").length, 1, "C の人数: " + cats.join(""));
  r2.changes.forEach((ch) => assert.ok(!excluded.includes(ch.to), "外した先生が再登場"));
  const all = Object.values(r2.assignment).flat();
  assert.strictEqual(new Set(all).size, all.length, "重複あり");
  // 残りが足りないとき
  const ex2 = excluded.concat(r2.changes.map((c) => c.from));
  const left = L.remainingTeachers(p.teachers, r2.assignment, ex2).length;
  const r3 = L.redraw(p.teachers, r2.assignment, ex2, "5-2", [0, 1, 2, 3, 4, 5, 6, 7, 8].slice(0, left + 1));
  assert.strictEqual(r3.ok, false);
  console.log("   不足時:", r3.errors[0]);
});

test("補充の先生がクラスに偏らない（A不足をCで補う場合も、Cは各クラス同じ人数）", () => {
  // A12 B6 C9 → A18必要: 6不足 → Cで補う（C合計9人を各クラス3人ずつが理想）
  const t = [];
  for (let i = 1; i <= 12; i++) t.push({ name: "A" + i, category: "A" });
  for (let i = 1; i <= 6; i++) t.push({ name: "B" + i, category: "B" });
  for (let i = 1; i <= 9; i++) t.push({ name: "C" + i, category: "C" });
  const by = Object.fromEntries(t.map((x) => [x.name, x.category]));
  for (let k = 0; k < 300; k++) {
    const res = L.buildAssignment(t, CONFIG.classes, groups(9, 9, 9), CONFIG.categoryTable);
    CONFIG.classes.forEach((c) => {
      const cCount = res.assignment[c.id].filter((n) => by[n] === "C").length;
      assert.strictEqual(cCount, 3, c.name + " の C が " + cCount + "人（偏り）");
    });
  }
});

console.log(failed ? "\n" + failed + "件 失敗" : "\nすべて成功");
process.exit(failed ? 1 : 0);
