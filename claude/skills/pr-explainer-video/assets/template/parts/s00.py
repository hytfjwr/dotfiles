# -*- coding: utf-8 -*-
# 見本シーン：リトライの間隔を固定から指数バックオフに替える（架空の話題）。タイトル、図 1 つ、ステップ 3 つ
from scenes_base import scene, card

FIXED = [300 + i * 240 for i in range(6)]               # 固定間隔：どの間隔も同じ幅
EXPO = [300 + t * 85 for t in (0, 1, 3, 7, 15)]        # 指数：1, 2, 4, 8 秒空ける（累積 0, 1, 3, 7, 15 秒）


def dots(prefix, xs, y):
    return "".join(f'<div id="{prefix}{k}" class="dot" style="left:{x - 22}px;top:{y - 22}px;width:44px;height:44px"></div>' for k, x in enumerate(xs))


def gaps(prefix, xs, y, labels):
    return "".join(f'<div id="{prefix}{k}" class="abs s" style="left:{(a + b) // 2 - 50}px;top:{y}px;width:100px;text-align:center">{lb}</div>'
                   for k, (a, b, lb) in enumerate(zip(xs, xs[1:], labels)))


html = (
    '<div id="l1" class="lane" style="top:20px;height:300px;background:var(--gray-l)"><b>固定間隔</b></div>'
    '<div id="l2" class="lane" style="top:350px;height:300px;background:var(--brand-l)"><b>指数バックオフ</b></div>'
    '<div id="ax1" class="abs" style="left:300px;top:150px;width:1340px;height:4px;background:var(--gray)"></div>'
    '<div id="ax2" class="abs" style="left:300px;top:470px;width:1340px;height:4px;background:var(--brand)"></div>'
    + dots("f", FIXED, 152) + gaps("fg", FIXED, 190, ["1 秒"] * 5)
    + dots("e", EXPO, 472) + gaps("eg", EXPO, 510, ["1 秒", "2 秒", "4 秒", "8 秒"])
    + card("msg", 300, 690, 1000, '<div class="h2">失敗が続くほど、次までの間隔を広げる</div>', cls="brand")
)

css = """
#s00 .dot{background:var(--gray)}
#s00 #e0,#s00 #e1,#s00 #e2,#s00 #e3,#s00 #e4{background:var(--brand)}
#s00 .lane>b{font-size:28px}
"""

scene("例", "リトライの間隔を指数バックオフにする", html,
      ["失敗したリクエストを再送する間隔を、指数バックオフにします。",
       "いまは1秒ごとに再送するので、障害中も同じ勢いで、相手を叩き続けます。",
       "指数バックオフは、1秒、2秒、4秒と、失敗のたびに間隔を倍にします。"],
      """
A(0,'#l1','left',{d:.2});A(0,'#ax1','wipe',{d:.5,dur:900});
A(1,'#f0,#f1,#f2,#f3,#f4,#f5','pop',{d:.3,stagger:.35});A(1,'#fg0,#fg1,#fg2,#fg3,#fg4','fade',{d:.5,stagger:.35});
A(2,'#l2','left',{d:.2});A(2,'#ax2','wipe',{d:.5,dur:900});
A(2,'#e0,#e1,#e2,#e3,#e4','pop',{d:1.0,stagger:.5});A(2,'#eg0,#eg1,#eg2,#eg3','fade',{d:1.2,stagger:.5});
A(2,'#msg','up',{d:3.4});
""", css=css)
