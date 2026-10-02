#!/usr/bin/env python3
"""ロイロノート用ワークシート（SVG）を作る。
使い方:  python3 tools/make_worksheets.py   → worksheets/*.svg を作成
PNG化:   sh tools/render_png.sh
"""
from pathlib import Path
from html import escape

W, H = 1600, 1200
OUT = Path(__file__).resolve().parent.parent / "worksheets"

FONT = "'Hiragino Sans','Hiragino Kaku Gothic ProN','BIZ UDPGothic','Yu Gothic','Meiryo','Noto Sans JP',sans-serif"
EMOJI = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif"

INK = "#222222"
MUTED = "#6b6b6b"
LINE = "#9a9a9a"
ACCENT = "#1f5fae"   # 青
ACCENT_BG = "#eaf1fb"
WARM = "#c0392b"     # can't 用
WARM_BG = "#fbeceb"
SOFT = "#f4f5f7"


def t(x, y, s, size=32, weight=400, fill=INK, anchor="start", family=FONT, extra=""):
    return (f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" '
            f'font-weight="{weight}" fill="{fill}" text-anchor="{anchor}" {extra}>{s}</text>')


def rect(x, y, w, h, r=16, fill="#fff", stroke=LINE, sw=2, extra=""):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}" {extra}/>')


def line(x1, y1, x2, y2, stroke=LINE, sw=3, extra=""):
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-width="{sw}" {extra}/>'


def arrow_right(x, y, w=36, color=ACCENT):
    """(x, y) を左端・中心とする右向き矢印"""
    return (f'<path d="M{x},{y-7} h{w-16} v-9 l16,16 l-16,16 v-9 h-{w-16} z" fill="{color}"/>')


def svg(body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">\n'
            f'<rect width="{W}" height="{H}" fill="#ffffff"/>\n' + "\n".join(body) + "\n</svg>\n")


def name_blank(x, y, w, h, label="先生の名前"):
    return [rect(x, y, w, h, r=12, fill="#fff", stroke=ACCENT, sw=3),
            t(x + 14, y + 26, label, 20, 400, MUTED)]


# ------------------------------------------------------------------
# Card 1  質問を考えよう
# ------------------------------------------------------------------
def card1():
    b = []
    # タイトル
    b += name_blank(40, 32, 340, 96)
    b.append(t(396, 103, "先生に、どんなことを聞こう？", 58, 800))
    b.append(t(42, 172, "その先生のことを、もっと知るための質問を考えよう。", 30, 400, MUTED))

    # 列の位置
    qx, qw = 40, 70
    c1x, c1w = 118, 322
    c2x, c2w = 484, 316
    c3x, c3w = 846, 374
    arrows = [(c1x + c1w + 4, ), (c2x + c2w + 4, )]

    # 見出し（①②③）
    hy, hh = 200, 74
    heads = [(c1x, c1w, "①", "何ができるか聞きたい？", "日本語で考えよう"),
             (c2x, c2w, "②", "「〇〇する」は英語で？", "動作を英語に"),
             (c3x, c3w, "③", "質問にしよう！", "Can you ...?")]
    for x, w, num, main, sub in heads:
        b.append(rect(x, hy, w, hh, r=14, fill=ACCENT, stroke=ACCENT))
        b.append(t(x + 14, hy + 36, f"{num} {main}", 23, 700, "#fff"))
        b.append(t(x + 52, hy + 64, sub, 20, 400, "#dfe9f7"))
    for (ax,) in arrows:
        b.append(arrow_right(ax, hy + hh / 2))

    # 例
    ey, eh = 286, 84
    b.append(rect(qx, ey, c3x + c3w - qx, eh, r=14, fill=SOFT, stroke="#dcdcdc"))
    b.append(t(qx + qw / 2, ey + 54, "例", 30, 800, MUTED, "middle"))
    b.append(t(c1x + 14, ey + 54, "「野球ができるかな？」", 28, 700))
    b.append(t(c2x + 14, ey + 54, "play baseball", 32, 700, ACCENT))
    b.append(t(c3x + 14, ey + 54, "Can you play baseball?", 28, 700, ACCENT))
    for (ax,) in arrows:
        b.append(arrow_right(ax, ey + eh / 2, color="#9bb6dc"))

    # 記入欄 Q1〜Q4
    top, rowh, gap = 386, 182, 14
    for i in range(4):
        y = top + i * (rowh + gap)
        b.append(f'<circle cx="{qx + qw / 2}" cy="{y + rowh / 2}" r="32" fill="{ACCENT_BG}" stroke="{ACCENT}" stroke-width="2"/>')
        b.append(t(qx + qw / 2, y + rowh / 2 + 12, f"Q{i + 1}", 32, 800, ACCENT, "middle"))
        b.append(rect(c1x, y, c1w, rowh))
        b.append(t(c1x + 14, y + 40, "「", 32, 400, "#b5b5b5"))
        b.append(t(c1x + c1w - 14, y + rowh - 18, "」", 32, 400, "#b5b5b5", "end"))
        b.append(rect(c2x, y, c2w, rowh))
        b.append(rect(c3x, y, c3w, rowh, fill="#fbfcfe", stroke=ACCENT))
        b.append(t(c3x + 18, y + 56, "Can you", 36, 700, ACCENT))
        b.append(line(c3x + 20, y + rowh - 36, c3x + c3w - 52, y + rowh - 36, LINE, 3))
        b.append(t(c3x + c3w - 22, y + rowh - 40, "?", 44, 800, ACCENT, "middle"))
        for (ax,) in arrows:
            b.append(arrow_right(ax, y + rowh / 2, color="#c9d6ea"))

    # Idea 欄
    sx, sy, sw_, sh = 1252, 200, 308, 964
    b.append(rect(sx, sy, sw_, sh, r=18, fill="#fffaf0", stroke="#e8c98a", sw=2))
    b.append(t(sx + 24, sy + 56, "Idea", 40, 800, "#a86b00"))
    b.append(t(sx + 132, sy + 54, "💡", 34, 400, family=EMOJI))
    b.append(t(sx + 24, sy + 98, "いろいろな種類の", 24, 700, INK))
    b.append(t(sx + 24, sy + 130, "質問を考えてみよう！", 24, 700, INK))
    ideas = [("⚾", "Sports", "スポーツ"),
             ("🎵", "Music", "音楽"),
             ("🍳", "Food / Cooking", "食べ物・料理"),
             ("🎨", "Hobbies", "趣味"),
             ("💬", "Languages", "ことば"),
             ("🏫", "School", "学校"),
             ("⭐", "Special question", "その先生ならでは！")]
    iy, ih = sy + 158, 112
    for k, (emo, en, ja) in enumerate(ideas):
        y = iy + k * ih
        b.append(line(sx + 18, y, sx + sw_ - 18, y, "#ecd9b0", 2))
        b.append(t(sx + 24, y + 62, emo, 38, 400, family=EMOJI))
        b.append(t(sx + 80, y + 48, en, 27 if len(en) < 13 else 24, 700))
        b.append(t(sx + 80, y + 84, ja, 23, 400, MUTED))
    return svg(b)


# ------------------------------------------------------------------
# Card 2  Interview
# ------------------------------------------------------------------
def card2():
    b = []
    b.append(t(40, 112, "Interview", 76, 800, ACCENT))
    b += name_blank(470, 30, 460, 104, "Teacher（先生の名前）")
    b.append(t(946, 108, "先生！", 64, 800))

    top, rowh, gap = 168, 206, 16
    for i in range(4):
        y = top + i * (rowh + gap)
        b.append(rect(40, y, 1520, rowh, r=18, fill="#fff", stroke="#c9c9c9"))
        # Q 番号
        b.append(f'<circle cx="104" cy="{y + rowh / 2}" r="40" fill="{ACCENT}"/>')
        b.append(t(104, y + rowh / 2 + 14, f"Q{i + 1}", 38, 800, "#fff", "middle"))
        # Can you ______ ?
        base = y + 128
        b.append(t(170, base, "Can you", 48, 700))
        b.append(line(392, base + 6, 1010, base + 6, LINE, 3))
        b.append(t(1030, base, "?", 54, 800, INK, "middle"))
        # 答え
        b.append(line(1080, y + 22, 1080, y + rowh - 22, "#dddddd", 2))
        for k, (ans, col) in enumerate([("Yes, I can.", ACCENT), ("No, I can't.", WARM)]):
            cy = y + 62 + k * 84
            b.append(f'<circle cx="1136" cy="{cy}" r="26" fill="#fff" stroke="{col}" stroke-width="4"/>')
            b.append(t(1184, cy + 14, ans, 40, 700, col))

    # 会話サポート
    y = 1080
    b.append(t(40, y + 48, "インタビューの流れ", 24, 700, MUTED))
    steps = [("Hello!", "あいさつ"), ("Can you ...?", "しつもん"), ("Thank you!", "おれい")]
    x = 300
    for k, (en, ja) in enumerate(steps):
        w = 300
        b.append(rect(x, y, w, 88, r=44, fill=SOFT, stroke="#d6d6d6"))
        b.append(t(x + w / 2, y + 44, en, 34, 700, INK, "middle"))
        b.append(t(x + w / 2, y + 76, ja, 20, 400, MUTED, "middle"))
        if k < 2:
            b.append(arrow_right(x + w + 16, y + 44, 44, "#9bb6dc"))
        x += w + 76
    return svg(b)


# ------------------------------------------------------------------
# Card 3  Mystery Teacher Quiz
# ------------------------------------------------------------------
def rich(x, y, parts, size, anchor="start"):
    """色ちがいの文字を1行に並べる。parts = [(文字, 色, 太さ), ...]"""
    spans = "".join(f'<tspan fill="{c}" font-weight="{w}">{escape(s)}</tspan>' for s, c, w in parts)
    return (f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" '
            f'text-anchor="{anchor}" xml:space="preserve">{spans}</text>')


def card3():
    b = []
    b.append(t(40, 96, "Mystery Teacher Quiz", 66, 800, ACCENT))
    b.append(t(880, 92, "先生クイズを作ろう！", 44, 800))
    b.append(t(42, 156, "インタビューの答えを、「その先生ができること・できないこと」に変えよう。", 30, 400, MUTED))

    # 変換の例
    p1x, p1w = 40, 470
    p2x, p2w = 580, 270
    p3x, p3w = 920, 640
    ly = 206
    for x, w, s in [(p1x, p1w, "インタビューで聞いた"), (p2x, p2w, "先生の答え"), (p3x, p3w, "クイズの文にすると……")]:
        b.append(t(x + w / 2, ly, s, 22, 700, MUTED, "middle"))
    examples = [
        ("Can you play baseball?", "Yes, I can.", ACCENT, ACCENT_BG,
         [("He ", INK, 800), ("can", ACCENT, 800), (" play baseball.", INK, 700)]),
        ("Can you play the piano?", "No, I can't.", WARM, WARM_BG,
         [("She ", INK, 800), ("can't", WARM, 800), (" play the piano.", INK, 700)]),
    ]
    for k, (q, a, col, bg, quiz) in enumerate(examples):
        y = 222 + k * 104
        h = 88
        b.append(rect(p1x, y, p1w, h, r=44, fill=SOFT, stroke="#d6d6d6"))
        b.append(t(p1x + p1w / 2, y + 56, q, 32, 700, INK, "middle"))
        b.append(arrow_right(p1x + p1w + 12, y + h / 2, 46))
        b.append(rect(p2x, y, p2w, h, r=44, fill=bg, stroke=col))
        b.append(t(p2x + p2w / 2, y + 56, a, 32, 700, col, "middle"))
        b.append(arrow_right(p2x + p2w + 12, y + h / 2, 46))
        b.append(rect(p3x, y, p3w, h, r=16, fill="#fff", stroke=col, sw=4))
        b.append(rich(p3x + p3w / 2, y + 58, quiz, 38, "middle"))

    # クイズ作成欄
    hy = 468
    b.append(t(40, hy, "クイズを作ろう", 32, 800))
    b.append(t(292, hy, "He / She と can / can't の、合うほうに ○ をつけよう。", 26, 400, MUTED))
    b.append(t(1560, hy, "男の先生 → He　女の先生 → She", 24, 400, MUTED, "end"))

    top, rowh, gap = 490, 118, 12
    for i in range(4):
        y = top + i * (rowh + gap)
        b.append(rect(40, y, 1520, rowh, r=16, fill="#fff", stroke="#c9c9c9"))
        b.append(rect(58, y + 26, 150, 66, r=33, fill=ACCENT, stroke=ACCENT))
        b.append(t(133, y + 71, f"Hint {i + 1}", 32, 800, "#fff", "middle"))
        base = y + 74
        b.append(rich(240, base, [("He", INK, 700), (" / ", "#aaaaaa", 400), ("She", INK, 700)], 40))
        b.append(rich(480, base, [("can", ACCENT, 700), (" / ", "#aaaaaa", 400), ("can't", WARM, 700)], 40))
        b.append(line(740, base + 8, 1510, base + 8, LINE, 3))
        b.append(t(1528, base, ".", 48, 800, INK, "middle"))

    # Who is he? / Who is she?
    y = 1030
    b.append(rect(40, y, 900, 140, r=20, fill=ACCENT_BG, stroke=ACCENT, sw=3))
    b.append(t(490, y + 92, "Who is he?　Who is she?", 56, 800, ACCENT, "middle"))
    b.append(rect(980, y, 580, 140, r=20, fill="#fffaf0", stroke="#e8c98a"))
    b.append(t(1010, y + 62, "💡", 36, 400, family=EMOJI))
    b.append(t(1066, y + 60, "その先生らしいヒントが", 32, 700))
    b.append(t(1066, y + 108, "あると、おもしろい！", 32, 700))
    return svg(b)


# ------------------------------------------------------------------
# Card 4  班とメンバー
# ------------------------------------------------------------------
def card4():
    b = []
    b.append(t(40, 112, "Our Group", 76, 800, ACCENT))
    b.append(t(530, 108, "わたしたちの班", 56, 800))

    # 組・班
    y, h = 170, 190
    b.append(rect(40, y, 1520, h, r=20, fill=ACCENT_BG, stroke=ACCENT, sw=3))
    base = y + 128
    b.append(t(90, base, "5年", 84, 800))
    b.append(rect(270, y + 28, 260, h - 56, r=14, fill="#fff", stroke=ACCENT, sw=3))
    b.append(t(552, base, "組", 84, 800))
    b.append(rect(800, y + 28, 300, h - 56, r=14, fill="#fff", stroke=ACCENT, sw=3))
    b.append(t(1122, base, "班", 84, 800))
    b.append(t(1250, base - 8, "Group", 44, 700, MUTED))

    # メンバー
    b.append(t(40, 428, "Members", 44, 800, ACCENT))
    b.append(t(300, 426, "メンバーの名前を書こう", 32, 400, MUTED))
    top, rowh, gap = 456, 222, 16
    colw, colgap = 752, 16
    for i in range(6):
        col, row = i % 2, i // 2
        x = 40 + col * (colw + colgap)
        yy = top + row * (rowh + gap)
        b.append(rect(x, yy, colw, rowh, r=18, fill="#fff", stroke="#c9c9c9"))
        b.append(f'<circle cx="{x + 70}" cy="{yy + rowh / 2}" r="38" fill="{ACCENT}"/>')
        b.append(t(x + 70, yy + rowh / 2 + 15, str(i + 1), 42, 800, "#fff", "middle"))
        b.append(line(x + 136, yy + rowh - 56, x + colw - 36, yy + rowh - 56, LINE, 3))
    return svg(b)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for name, fn in [("card-01-question-builder", card1),
                     ("card-02-interview", card2),
                     ("card-03-quiz-maker", card3),
                     ("card-04-group-members", card4)]:
        (OUT / f"{name}.svg").write_text(fn(), encoding="utf-8")
        print("wrote", OUT / f"{name}.svg")
