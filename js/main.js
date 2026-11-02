/* =========================================================
   つちのね便 main.js
   ページごとに必要な処理だけを動かします（body の data-page で判定）
   ※ カート・注文・お問い合わせの送信処理は、公開時に決済・フォームのサービスとつなぎます。
   ========================================================= */
(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const page = document.body.dataset.page || "";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // 文章の「。」のあとで改行する（HTML側のビルドと同じルール）
  const brMaru = (s) => esc(s).replace(/。(?=[^」』）)\s])/g, "。<br>");
  const yen = (n) => "¥" + Number(n).toLocaleString("ja-JP");
  const priceHTML = (n) => `<span class="num">${yen(n)}</span><small>（税込）</small>`;

  document.documentElement.classList.remove("no-js");

  /* ---------- スムーススクロール（Lenis） ----------
     ホイール・トラックパッドのスクロールをなめらかに。動きを減らす設定のときは使わない。
     カート・モーダル・メニューの中は data-lenis-prevent でふつうにスクロール */
  const headerOffset = () => (window.innerWidth <= 767 ? 76 : 100);
  let lenis = null;
  if (window.Lenis && !reduceMotion) {
    lenis = new window.Lenis({ lerp: 0.1, wheelMultiplier: 1, smoothWheel: true });
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    // メニュー・カート・モーダルを開いている間は、後ろのページを止める
    new MutationObserver(() => (document.body.classList.contains("is-locked") ? lenis.stop() : lenis.start()))
      .observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }
  // ページ内リンク・ボタンからの移動（固定ヘッダーの分だけ上をあける）
  const smoothTo = (target, opt = {}) => {
    const el = typeof target === "string" ? document.querySelector(target) : target;
    const top = typeof target === "number" ? target : el ? el.getBoundingClientRect().top + window.scrollY - (opt.offset ?? headerOffset()) : null;
    if (top === null) return;
    if (lenis) lenis.scrollTo(top, { duration: opt.duration || 1.2 });
    else window.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
  };
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href*="#"]');
    if (!a || e.defaultPrevented) return;
    const url = new URL(a.href, location.href);
    if (url.pathname !== location.pathname || !url.hash || url.hash === "#") return;
    let el = null;
    try { el = document.querySelector(decodeURIComponent(url.hash)); } catch { return; }
    if (!el) return;
    e.preventDefault();
    history.pushState(null, "", url.hash);
    smoothTo(el);
  });

  /* ---------- スマホ：左寄せの本文を両端そろえにする ----------
     日本語の文章が途中で折り返して右側に余白が出ないように。中央寄せの文章はそのまま */
  const justifyText = () => {
    const sp = window.innerWidth <= 767;
    $$("main p, main li, main dd, .c-modal p, .c-modal dd").forEach((el) => {
      if (!sp) { el.classList.remove("is-justify"); return; }
      if (el.classList.contains("is-justify")) return;
      const a = getComputedStyle(el).textAlign;
      if (a === "start" || a === "left") el.classList.add("is-justify");
    });
  };
  /* ---------- スマホ：2行目以降が「1文字」や「1文字＋。」だけになるとき ----------
     その文（<br>で区切られたまとまり）だけ字間をほんの少し詰めて、ひとつ上の行に収める */
  const PUNCT = /[。、．，」』）\)！？!?・ー]/;
  const lineInfo = (root) => {
    const fs = parseFloat(getComputedStyle(root.parentElement || root).fontSize) || 15;
    let lines = 0, top = null, last = "";
    const roots = root.nodeType === 3 ? [root] : [root];
    roots.forEach((r) => {
      const w = r.nodeType === 3 ? null : document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
      const nodes = w ? (() => { const a = []; let n; while ((n = w.nextNode())) a.push(n); return a; })() : [r];
      nodes.forEach((n) => {
        for (let i = 0; i < n.length; i++) {
          const ch = n.data[i];
          if (/\s/.test(ch)) continue;
          const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + 1);
          const q = rg.getBoundingClientRect();
          if (!q.width && !q.height) continue;
          if (top === null || q.top > top + fs * 0.5) { lines++; top = q.top; last = ""; }
          last += ch;
        }
      });
    });
    return { lines, last };
  };
  const isOrphan = (last) => last.length === 1 || (last.length === 2 && PUNCT.test(last[1]));
  const fitOrphans = () => {
    const sp = window.innerWidth <= 767;
    $$("main p, main li, main dd, .c-modal p, .c-modal dd, .p-news__item h3, .p-topnews__title, main td, main tbody th").forEach((el) => {
      $$(".u-fit", el).forEach((f) => (f.style.letterSpacing = ""));
      if (!sp || !el.offsetParent || el.closest(".p-story")) return;
      // 中にカードや画像などのブロック要素がある項目は対象外（文章だけの段落に使う）
      if ([...el.querySelectorAll("*")].some((c) => c.nodeName !== "BR" && !c.classList.contains("u-fit") && !/^inline/.test(getComputedStyle(c).display))) return;
      const segs = []; let cur = [];
      [...el.childNodes].forEach((n) => { if (n.nodeName === "BR") { segs.push(cur); cur = []; } else cur.push(n); });
      segs.push(cur);
      segs.forEach((nodes) => {
        if (!nodes.some((n) => n.textContent.trim())) return;
        let span = nodes.length === 1 && nodes[0].classList && nodes[0].classList.contains("u-fit") ? nodes[0] : null;
        if (!span) {
          // 1行目が途中で折り返す文だけを対象に、まとまりを <span class="u-fit"> で包む
          const probe = document.createElement("span");
          probe.className = "u-fit";
          nodes[0].before(probe);
          nodes.forEach((n) => probe.appendChild(n));
          span = probe;
        }
        const info = lineInfo(span);
        if (info.lines < 2 || !isOrphan(info.last)) return;
        const base = parseFloat(getComputedStyle(span).letterSpacing) || 0;
        for (let k = 1; k <= 8; k++) {
          span.style.letterSpacing = `${(base - k * 0.15).toFixed(2)}px`;
          if (lineInfo(span).lines < info.lines) return;
        }
        span.style.letterSpacing = "";
      });
    });
  };
  /* ---------- 表：中身がどの欄からもはみ出さないよう、はみ出すときだけ文字を少しずつ小さくする ---------- */
  const cellOver = (c) => {
    const cs = getComputedStyle(c);
    const r = c.getBoundingClientRect();
    const L = r.left + parseFloat(cs.paddingLeft) - 1, R = r.right - parseFloat(cs.paddingRight) + 1;
    const rg = document.createRange(); rg.selectNodeContents(c);
    return [...rg.getClientRects()].some((q) => q.width && (q.right > R || q.left < L));
  };
  const fitTables = () => {
    $$(".c-table").forEach((t) => {
      t.style.fontSize = "";
      if (!t.offsetParent) return;
      let fs = parseFloat(getComputedStyle(t).fontSize);
      const cells = $$("th, td", t);
      for (let n = 0; n < 16 && fs > 10 && cells.some(cellOver); n++) {
        fs -= 0.5;
        t.style.fontSize = `${fs}px`;
      }
    });
  };
  const layoutText = () => { fitTables(); justifyText(); fitOrphans(); };
  let textTimer = 0;
  layoutText();
  document.fonts?.ready.then(layoutText);
  window.addEventListener("resize", () => { clearTimeout(textTimer); textTimer = setTimeout(layoutText, 200); });

  /* ---------- 上へ戻るボタン ---------- */
  const totop = $("[data-totop]");
  if (totop) {
    const onTop = () => totop.classList.toggle("is-show", window.scrollY > window.innerHeight * 0.8);
    onTop();
    window.addEventListener("scroll", onTop, { passive: true });
    totop.addEventListener("click", () => smoothTo(0, { duration: 1.4 }));
  }

  /* ---------- ラインナップから移ってきたとき：ページが下からふわっと出る ---------- */
  try {
    if (sessionStorage.getItem("tsuchinone_fly")) {
      sessionStorage.removeItem("tsuchinone_fly");
      if (!reduceMotion) document.documentElement.classList.add("is-arrive");
    }
  } catch { /* noop */ }

  /* ---------- 画像がないとき：仮の枠を表示 ---------- */
  const watchImages = (root = document) => {
    $$(".c-media img", root).forEach((img) => {
      const ok = () => img.classList.add("is-loaded");
      const miss = () => img.classList.add("is-missing");
      if (img.complete) { img.naturalWidth > 0 ? ok() : miss(); return; }
      img.addEventListener("load", ok, { once: true });
      img.addEventListener("error", miss, { once: true });
    });
  };
  watchImages();

  /* ---------- トースト ---------- */
  const toastEl = document.createElement("div");
  toastEl.className = "c-toast";
  toastEl.setAttribute("role", "status");
  document.body.appendChild(toastEl);
  let toastTimer;
  const toast = (msg) => {
    toastEl.textContent = msg;
    toastEl.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-show"), 2600);
  };

  /* ---------- ヘッダー ---------- */
  const header = $(".l-header");
  const onScroll = () => header && header.classList.toggle("is-scrolled", window.scrollY > 10);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const burger = $(".c-burger");
  const nav = $(".g-nav");
  if (burger && nav) {
    const setNav = (open) => {
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "メニューを閉じる" : "メニューを開く");
      nav.classList.toggle("is-open", open);
      document.body.classList.toggle("is-locked", open);
    };
    burger.addEventListener("click", () => setNav(burger.getAttribute("aria-expanded") !== "true"));
    $$("a", nav).forEach((a) => a.addEventListener("click", () => setNav(false)));
    window.addEventListener("resize", () => { if (window.innerWidth > 1023) setNav(false); });
  }

  /* ---------- スクロールで表示（0.1秒ずつずらす） ---------- */
  // 同時に画面に入ったものを、上の行→左から順に0.1秒ずつずらして表示する
  // （番号順にずらすと、3列の3行目などで右のカードが先に出てしまうため）
  const io = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
        const shown = entries.filter((e) => e.isIntersecting).map((e) => e.target);
        const groups = new Map();
        shown.forEach((el) => {
          const g = el.parentElement && el.parentElement.hasAttribute("data-stagger") ? el.parentElement : null;
          if (!g) return;
          if (!groups.has(g)) groups.set(g, []);
          groups.get(g).push(el);
        });
        groups.forEach((els) => {
          els.sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return Math.abs(ra.top - rb.top) > 8 ? ra.top - rb.top : ra.left - rb.left; })
             .forEach((el, i) => el.style.setProperty("--delay", `${Math.min(i, 7) * 0.1}s`));
        });
        shown.forEach((el) => { el.classList.add("is-in"); io.unobserve(el); });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 })
    : null;
  const observeReveal = (root = document) => $$(".js-reveal:not(.is-in)", root).forEach((el) => (io ? io.observe(el) : el.classList.add("is-in")));
  observeReveal();

  /* ---------- ファーストビュー（スクロールで進む） ---------- */
  const story = $("[data-story]");
  if (story) {
    // 野菜画像：images/photo/fv/ の画像がなければイラストを表示
    $$(".p-story__veg img", story).forEach((img) => {
      const fallback = () => {
        if (img.dataset.fallback && !img.parentElement.classList.contains("is-fallback")) {
          img.parentElement.classList.add("is-fallback");
          img.src = img.dataset.fallback;
        }
      };
      img.addEventListener("error", fallback);
      if (img.complete && img.naturalWidth === 0) fallback();
    });
    // フォントの読み込みを待ってから、ロゴを書きはじめる（野菜もパッと出る）
    const play = () => story.classList.add("is-play", "is-logo");
    const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    Promise.race([fontsReady, new Promise((r) => setTimeout(r, 1500))]).then(() => requestAnimationFrame(play));
    // 画面中央のメッセージ：スクロール位置に合わせて、その場でふわっと出て消える
    const scenes = $$(".p-story__scene", story).map((el) => ({
      el, at: parseFloat(el.dataset.at), from: parseFloat(el.dataset.in),
    }));
    const clamp01 = (v) => Math.min(1, Math.max(0, v));
    const drawScenes = (p) => {
      scenes.forEach((s) => {
        // data-at：その位置を中心に出る ／ data-in：その位置から出て、そのまま残る
        const o = isNaN(s.at)
          ? clamp01((p - s.from) / 0.05)
          : clamp01((p - (s.at - 0.09)) / 0.05) * clamp01((s.at + 0.09 - p) / 0.05);
        s.el.style.opacity = o.toFixed(3);
        s.el.style.visibility = o > 0.01 ? "visible" : "hidden";
        s.el.style.transform = reduceMotion ? "none" : `translateY(${((1 - o) * 16).toFixed(1)}px) scale(${(0.96 + o * 0.04).toFixed(3)})`;
        s.el.style.filter = reduceMotion || o > 0.99 ? "none" : `blur(${((1 - o) * 6).toFixed(1)}px)`;
        s.el.classList.toggle("is-active", o > 0.5);
      });
    };
    // 最初のロゴ：スクロールで消えたあと、いちばん上に戻ったら、もう一度ペンで書き直す
    const replayLogo = (p) => {
      if (!story.classList.contains("is-play")) return;
      if (p > 0.2 && story.classList.contains("is-logo")) story.classList.remove("is-logo");
      else if (p < 0.03 && !story.classList.contains("is-logo")) { void story.offsetWidth; story.classList.add("is-logo"); }
    };

    // スクロール量（0〜1）を --p に入れる
    let ticking = false;
    const update = () => {
      ticking = false;
      const r = story.getBoundingClientRect();
      const vh = window.innerHeight;
      const range = r.height - vh * 2; // 最後の1画面分は、次のセクションがかぶってくる区間
      const p = range > 0 ? Math.min(1, Math.max(0, -r.top / range)) : 0;
      const q = Math.min(1, Math.max(0, (-r.top - range) / vh));
      story.style.setProperty("--p", p.toFixed(4));
      story.style.setProperty("--q", q.toFixed(4));
      drawScenes(p);
      replayLogo(p);
    };
    const onStory = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener("scroll", onStory, { passive: true });
    window.addEventListener("resize", onStory);
    update();
  }

  /* =========================================================
     カート（localStorage に保存。ページを移動しても残る）
     ========================================================= */
  const CART_KEY = "tsuchinone_cart";
  const SHIP = { standard: 1000, cool: 300 }; // 送料の目安（料金・送料ページと合わせて更新）
  // 定期便にできるセット（定期便は通常価格から10%オフ・1回のお届けにつき1箱）
  const SUB_SETS = ["set-small", "set-s", "set-m", "set-l"];
  const SUB_OFF = 0.9;
  const MODES = { once: "今回のみ", biweekly: "定期便・隔週", weekly: "定期便・毎週" };
  const isSub = (i) => i.mode === "biweekly" || i.mode === "weekly";
  const keyOf = (id, mode) => (mode && mode !== "once" ? `${id}@${mode}` : id);
  const loadCart = () => {
    try {
      return (JSON.parse(localStorage.getItem(CART_KEY)) || []).map((i) => ({ ...i, key: i.key || i.id, base: i.base || i.price, mode: i.mode || "once" }));
    } catch { return []; }
  };
  let cart = loadCart();
  const saveCart = () => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* 保存できない環境 */ } };
  const cartCount = () => cart.reduce((s, i) => s + i.qty, 0);
  const subtotal = () => cart.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = () => {
    if (!cart.length) return 0;
    if (cart.every((i) => i.id === "trial")) return 0; // お試しセットのみは送料無料
    return SHIP.standard;
  };

  const cartEl = $(".c-cart");
  const badge = $(".c-cart-btn__badge");

  const updateBadge = (bump = false) => {
    if (!badge) return;
    const n = cartCount();
    badge.textContent = n;
    badge.dataset.count = n;
    if (bump) { badge.classList.remove("is-bump"); void badge.offsetWidth; badge.classList.add("is-bump"); }
  };

  // セットの名前・価格は商品データ（products.json）から取る
  let DATA = null;
  const setInfo = (id) => (DATA?.products || []).find((p) => p.id === id);
  const shortName = (name) => String(name).replace("旬の野菜セット ", "");

  // full：カートページ（購入方法・セットを選べる）／ compact：右から出るカート
  const itemHTML = (i, full) => {
    const sub = isSub(i);
    const canSub = SUB_SETS.includes(i.id);
    const controls = canSub && full ? `
        <div class="c-cart-item__plan">
          <label>購入方法
            <select class="c-select" data-cart-mode aria-label="${esc(i.name)}の購入方法">
              ${Object.entries(MODES).map(([k, v]) => `<option value="${k}"${i.mode === k ? " selected" : ""}>${v}${k === "once" ? "" : "（10%オフ）"}</option>`).join("")}
            </select>
          </label>
          <label>セット
            <select class="c-select" data-cart-set aria-label="${esc(i.name)}のセットの大きさ">
              ${SUB_SETS.map((id) => `<option value="${id}"${i.id === id ? " selected" : ""}>${esc(shortName(setInfo(id)?.name || id))}</option>`).join("")}
            </select>
          </label>
        </div>` : "";
    const qty = sub
      ? `<p class="c-cart-item__per">1回のお届けにつき1箱</p>`
      : `<div class="c-qty">
            <button type="button" data-cart-qty="-1" aria-label="${esc(i.name)}を1つ減らす">−</button>
            <input type="number" value="${i.qty}" min="1" max="20" aria-label="${esc(i.name)}の数量" data-cart-input>
            <button type="button" data-cart-qty="1" aria-label="${esc(i.name)}を1つ増やす">＋</button>
          </div>`;
    return `
    <li class="c-cart-item${sub ? " is-sub" : ""}" data-key="${esc(i.key)}">
      <div class="c-media c-cart-item__media">
        <!-- 商品写真：${esc(i.name)} -->
        <img src="${esc(i.image)}" alt="">
        <span class="c-media__label"></span>
      </div>
      <div>
        ${sub ? `<p class="c-cart-item__sub"><span class="c-tag c-tag--deep">${MODES[i.mode]}</span><span>通常価格から10%オフ</span></p>` : ""}
        <p class="c-cart-item__name">${esc(i.name)}</p>
        <p class="c-cart-item__price">${sub ? `<s class="num">${yen(i.base)}</s> ` : ""}${yen(i.price)}<small>（税込）</small> / ${sub ? "1回" : esc(i.unit || "")}</p>
        ${controls}
        <div class="c-cart-item__row">
          ${qty}
          <button type="button" class="c-cart-item__remove" data-cart-remove>削除する</button>
        </div>
        ${sub && !full ? `<a class="c-cart-item__edit c-link" href="plan.html?edit=${encodeURIComponent(i.key)}">定期便の内容を変更する</a>` : ""}
      </div>
    </li>`;
  };

  const sumHTML = () => `
    <dt>小計</dt><dd class="num">${yen(subtotal())}</dd>
    <dt>送料</dt><dd class="num">${shipping() === 0 && cart.length ? "無料" : yen(shipping())}</dd>
    <dt class="is-total">合計（税込）</dt><dd class="is-total num">${yen(subtotal() + shipping())}</dd>
    ${cart.some(isSub) ? `<dd class="c-cart__subnote">定期便は、2回目以降も同じ金額（送料別）で自動でお届けします。</dd>` : ""}`;

  const renderCart = () => {
    $$("[data-cart-list]").forEach((list) => {
      const full = list.dataset.cartList === "full";
      list.innerHTML = cart.length
        ? cart.map((i) => itemHTML(i, full)).join("")
        : `<li class="c-cart__empty"><img src="images/illust/sprout.svg" alt=""><p>カートはまだ空です。<br>まずはお試しセットからどうぞ。</p></li>`;
      watchImages(list);
    });
    $$("[data-cart-sum]").forEach((el) => (el.innerHTML = sumHTML()));
    $$("[data-cart-checkout]").forEach((el) => el.toggleAttribute("disabled", !cart.length));
    // 定期便が入っているときは、クレジットカード払いのみ
    const hasSub = cart.some(isSub);
    $$("[data-pay-cvs]").forEach((el) => {
      el.disabled = hasSub;
      if (hasSub && el.checked) { el.checked = false; $("[data-pay-card]").checked = true; }
    });
    $$("[data-sub-hint]").forEach((el) => (el.hidden = !cart.some((i) => SUB_SETS.includes(i.id) && !isSub(i))));
    updateBadge();
  };

  // 定期便は1つだけ（新しく選ぶと入れ替え）。通常の商品は同じものなら数量を足す
  const putItem = (p, mode = "once", qty = 1) => {
    const sub = mode !== "once";
    const price = sub ? Math.round(p.price * SUB_OFF) : p.price;
    const item = { key: keyOf(p.id, mode), id: p.id, name: p.name, base: p.price, price, unit: p.unit, image: p.image, icon: p.icon, mode, qty: sub ? 1 : qty };
    if (sub) {
      const at = cart.findIndex(isSub);
      if (at >= 0) { cart[at] = item; return "replace"; }
      cart.push(item); return "add";
    }
    const hit = cart.find((i) => i.key === item.key);
    if (hit) { hit.qty = Math.min(20, hit.qty + qty); return "add"; }
    cart.push(item); return "add";
  };

  const addToCart = (p, qty = 1, fromEl, mode = "once") => {
    const r = putItem(p, mode, qty);
    saveCart();
    renderCart();
    flyToCart(fromEl, p.icon);
    toast(r === "replace" ? "定期便の内容を変更しました" : `「${p.name}」${mode !== "once" ? "の定期便" : ""}をカートに入れました`);
  };

  const changeQty = (key, next) => {
    const it = cart.find((i) => i.key === key);
    if (!it) return;
    it.qty = Math.max(1, Math.min(20, next || 1));
    saveCart(); renderCart();
  };

  // カートページで、購入方法（今回のみ／定期便）やセットの大きさを変える
  const changeItem = (key, { id, mode }) => {
    const at = cart.findIndex((i) => i.key === key);
    if (at < 0) return;
    const old = cart[at];
    const p = setInfo(id || old.id);
    if (!p) return;
    const m = mode || old.mode;
    cart.splice(at, 1);
    if (m === "once") putItem(p, "once", isSub(old) ? 1 : old.qty);
    else putItem(p, m, 1);
    // 並び順を保つ
    const moved = cart.findIndex((i) => i.key === keyOf(p.id, m));
    if (moved >= 0 && moved !== at) cart.splice(Math.min(at, cart.length - 1), 0, cart.splice(moved, 1)[0]);
    saveCart(); renderCart();
    toast(m === "once" ? "「今回のみ」の購入に変更しました" : `${MODES[m]}（${shortName(p.name)}）に変更しました`);
  };

  document.addEventListener("click", (e) => {
    const row = e.target.closest(".c-cart-item");
    if (!row) return;
    const key = row.dataset.key;
    const it = cart.find((i) => i.key === key);
    if (!it) return;
    if (e.target.closest("[data-cart-qty]")) changeQty(key, it.qty + Number(e.target.closest("[data-cart-qty]").dataset.cartQty));
    if (e.target.closest("[data-cart-remove]")) { cart = cart.filter((i) => i.key !== key); saveCart(); renderCart(); }
  });
  document.addEventListener("change", (e) => {
    const row = e.target.closest(".c-cart-item");
    if (!row) return;
    if (e.target.matches("[data-cart-input]")) changeQty(row.dataset.key, parseInt(e.target.value, 10));
    if (e.target.matches("[data-cart-mode]")) changeItem(row.dataset.key, { mode: e.target.value });
    if (e.target.matches("[data-cart-set]")) changeItem(row.dataset.key, { id: e.target.value });
  });

  // カートの開閉
  let lastFocus = null;
  const openCart = () => {
    if (!cartEl) return;
    lastFocus = document.activeElement;
    cartEl.classList.add("is-open");
    cartEl.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-locked");
    setTimeout(() => $(".c-cart__close", cartEl)?.focus(), 50);
  };
  const closeCart = () => {
    if (!cartEl || !cartEl.classList.contains("is-open")) return;
    cartEl.classList.remove("is-open");
    cartEl.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-locked");
    lastFocus?.focus?.();
  };
  $$("[data-cart-open]").forEach((b) => b.addEventListener("click", openCart));
  $$("[data-cart-close]").forEach((b) => b.addEventListener("click", closeCart));

  // カートへ飛ぶアイコン
  const flyToCart = (fromEl, icon) => {
    const target = $(".c-cart-btn");
    if (!fromEl || !target || reduceMotion) { updateBadge(true); return; }
    const a = fromEl.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const fly = document.createElement("div");
    fly.className = "c-fly";
    // 商品データの icon（イラスト）に対応するリアルな野菜写真があれば、そちらを使う
    const ill = icon || "images/illust/veg-carrot.svg";
    const photo = ill.replace("images/illust/", "images/photo/fv/").replace(/\.svg$/, ".webp");
    fly.innerHTML = `<img src="${esc(photo)}" onerror="this.onerror=null;this.src='${esc(ill)}'" alt="">`;
    fly.style.left = `${a.left + a.width / 2 - 20}px`;
    fly.style.top = `${a.top + a.height / 2 - 20}px`;
    document.body.appendChild(fly);
    requestAnimationFrame(() => {
      fly.style.transform = `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(.45) rotate(200deg)`;
      fly.style.opacity = ".4";
    });
    fly.addEventListener("transitionend", () => { fly.remove(); updateBadge(true); }, { once: true });
    setTimeout(() => { if (fly.isConnected) { fly.remove(); updateBadge(true); } }, 1000);
  };

  renderCart();

  /* =========================================================
     商品データ（data/products.json から読み込み）
     ローカルでHTMLを直接開いたとき（file://）は fetch が使えないため、
     同じ内容の data/products.js を代わりに読み込みます。
     ========================================================= */
  const loadData = async () => {
    if (DATA) return DATA;
    try {
      const res = await fetch("data/products.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(res.status);
      DATA = await res.json();
    } catch {
      DATA = await new Promise((resolve) => {
        if (window.TSUCHINONE_DATA) return resolve(window.TSUCHINONE_DATA);
        const s = document.createElement("script");
        s.src = "data/products.js";
        s.onload = () => resolve(window.TSUCHINONE_DATA || { products: [], categories: [] });
        s.onerror = () => resolve({ products: [], categories: [] });
        document.head.appendChild(s);
      });
    }
    if (DATA.shipping) { SHIP.standard = DATA.shipping.standard ?? SHIP.standard; SHIP.cool = DATA.shipping.cool ?? SHIP.cool; }
    renderCart();
    return DATA;
  };
  // カートページは、セットの名前を出すために商品データを先に読む
  if ($('[data-cart-list="full"]')) loadData();

  const catLabel = (id) => (DATA?.categories || []).find((c) => c.id === id)?.label || "";
  const catTagClass = (id) => ({ set: "", single: "c-tag--soil", fuzoroi: "c-tag--carrot", processed: "c-tag--soil" }[id] ?? "");

  const cardHTML = (p) => `
    <article class="c-product js-reveal" data-id="${esc(p.id)}" data-category="${esc(p.category)}">
      <button type="button" class="c-product__open" data-modal-open="${esc(p.id)}" aria-label="${esc(p.name)}の詳細を見る">
        <div class="c-media c-product__media">
          <span class="c-tag ${catTagClass(p.category)} c-product__cat">${esc(p.tag || catLabel(p.category))}</span>
          <!-- 商品写真：${esc(p.name)}（${esc(p.image)}） -->
          <img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">
          <span class="c-media__label">${esc(p.name)}の写真</span>
        </div>
      </button>
      <div class="c-product__body">
        <h3 class="c-product__name">${esc(p.name)}</h3>
        <p class="c-product__desc">${brMaru(p.desc)}</p>
        <div class="c-product__buy">
          <p class="c-product__price">${priceHTML(p.price)}</p>
          <div class="c-qty">
            <button type="button" data-q="-1" aria-label="数量を減らす">−</button>
            <input type="number" value="1" min="1" max="20" aria-label="${esc(p.name)}の数量">
            <button type="button" data-q="1" aria-label="数量を増やす">＋</button>
          </div>
          <button type="button" class="c-btn c-btn--sm c-btn--block" data-add="${esc(p.id)}">カートに入れる</button>
        </div>
      </div>
    </article>`;

  // 数量ボタン（カード・モーダル共通）
  document.addEventListener("click", (e) => {
    const q = e.target.closest("[data-q]");
    if (!q) return;
    const input = q.parentElement.querySelector("input");
    input.value = Math.max(1, Math.min(20, (parseInt(input.value, 10) || 1) + Number(q.dataset.q)));
  });

  const findProduct = (id) => (DATA?.products || []).find((p) => p.id === id);

  document.addEventListener("click", async (e) => {
    const add = e.target.closest("[data-add]");
    if (!add) return;
    await loadData();
    const p = findProduct(add.dataset.add);
    if (!p) return;
    const scope = add.closest(".c-product, .c-modal__panel, [data-add-scope]");
    const qty = parseInt(scope?.querySelector(".c-qty input")?.value, 10) || 1;
    addToCart(p, qty, add, add.dataset.mode || "once");
    if (add.dataset.after === "open-cart") setTimeout(openCart, 700);
  });

  const renderProducts = async () => {
    const lists = $$("[data-products]");
    if (!lists.length) return;
    await loadData();
    lists.forEach((list) => {
      const ids = (list.dataset.ids || "").split(",").map((s) => s.trim()).filter(Boolean);
      const items = ids.length ? ids.map(findProduct).filter(Boolean) : DATA.products;
      list.innerHTML = items.map(cardHTML).join("");
      list.setAttribute("data-stagger", "");
      $$(".js-reveal", list).forEach((el, i) => el.style.setProperty("--delay", `${(i % 6) * 0.1}s`));
      watchImages(list);
      observeReveal(list);
    });
    layoutText();
  };

  // 商品一覧の絞り込み
  const initProductFilter = () => {
    const bar = $("[data-product-filter]");
    const list = $("[data-products]");
    if (!bar || !list) return;
    const apply = (cat) => {
      $$("button", bar).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cat === cat)));
      let n = 0;
      $$(".c-product", list).forEach((card) => {
        const show = cat === "all" || card.dataset.category === cat;
        card.hidden = !show;
        card.style.display = show ? "" : "none";
        if (show) { card.classList.remove("is-in"); card.style.setProperty("--delay", `${(n++ % 6) * 0.1}s`); requestAnimationFrame(() => card.classList.add("is-in")); }
      });
      const cnt = $("[data-filter-count]");
      if (cnt) cnt.textContent = n;
    };
    bar.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) apply(b.dataset.cat); });
    const hash = location.hash.replace("#", "");
    apply($$("button", bar).some((b) => b.dataset.cat === hash) ? hash : "all");
  };

  /* ---------- 詳細モーダル（外側クリック・閉じるボタン・Escで閉じる） ---------- */
  const modal = $("#product-modal");
  const openModal = (p) => {
    if (!modal || !p) return;
    $(".c-modal__content", modal).innerHTML = `
      <div class="c-modal__grid">
        <div class="c-media c-modal__media" style="--ratio: 4 / 3">
          <!-- 商品写真：${esc(p.name)}（${esc(p.image)}） -->
          <img src="${esc(p.image)}" alt="${esc(p.name)}">
          <span class="c-media__label">${esc(p.name)}の写真</span>
        </div>
        <div>
          <span class="c-tag ${catTagClass(p.category)}">${esc(catLabel(p.category))}</span>
          <h2 class="c-modal__title" id="modal-title">${esc(p.name)}</h2>
          <p>${brMaru(p.detail || p.desc)}</p>
          <dl class="c-modal__spec">
            <div><dt>産地</dt><dd>${esc(p.origin)}</dd></div>
            <div><dt>生産者</dt><dd>${esc(p.producer)}</dd></div>
            <div><dt>保存方法</dt><dd>${brMaru(p.keep)}</dd></div>
            <div><dt>お届けの目安</dt><dd>${brMaru(p.delivery)}</dd></div>
          </dl>
          <div class="c-modal__buy">
            <p class="c-product__price">${priceHTML(p.price)}</p>
            <div class="c-qty">
              <button type="button" data-q="-1" aria-label="数量を減らす">−</button>
              <input type="number" value="1" min="1" max="20" aria-label="数量">
              <button type="button" data-q="1" aria-label="数量を増やす">＋</button>
            </div>
          </div>
          ${SUB_SETS.includes(p.id)
            ? `<div class="c-btns c-modal__btns">
                <button type="button" class="c-btn" data-add="${esc(p.id)}"><span>今回のみ購入する<span class="c-btn__note">カートに入れる</span></span></button>
                <a class="c-btn c-btn--ghost" href="plan.html?set=${esc(p.id)}"><span>定期便で注文する<span class="c-btn__note">通常価格から10%オフ</span></span></a>
              </div>`
            : `<button type="button" class="c-btn c-btn--block c-modal__btn" data-add="${esc(p.id)}">カートに入れる</button>`}
        </div>
      </div>`;
    watchImages(modal);
    requestAnimationFrame(layoutText);
    lastFocus = document.activeElement;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-locked");
    setTimeout(() => $(".c-modal__close", modal).focus(), 50);
  };
  const closeModal = () => {
    if (!modal || !modal.classList.contains("is-open")) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-locked");
    lastFocus?.focus?.();
  };
  if (modal) {
    document.addEventListener("click", async (e) => {
      const o = e.target.closest("[data-modal-open]");
      if (!o) return;
      await loadData();
      openModal(findProduct(o.dataset.modalOpen));
    });
    $$("[data-modal-close]", modal).forEach((b) => b.addEventListener("click", closeModal));
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closeModal(); closeCart();
  });

  /* ---------- 商品ラインナップ：3Dの円形カルーセル ----------
     自動でゆっくり回転（ホバーで停止）／ドラッグ・スワイプで回して慣性で流れる／
     止まると正面のカードにぴったり合う／カードを押すと正面へ、正面のカードを押すと商品ページへ */
  $$("[data-ring]").forEach((ring) => {
    const track = $(".p-ring__track", ring);
    const viewport = $(".p-ring__viewport", ring);
    const cards = $$(".p-ring__card", ring);
    const captions = $$(".p-ring__caption");
    const current = $("[data-ring-current]");
    const N = cards.length;
    const STEP = 360 / N;
    const COS_STEP = Math.cos((STEP * Math.PI) / 180);
    const TILT = -5;           // 少し上から見下ろす角度
    const DRIFT = 4;           // 自動回転の速さ（度/秒）
    const ZOOM = 0.22;         // 正面カードの拡大率（+22%）
    const BLUR = 4;            // 一番奥のカードのぼかし（px）
    let rot = 0, vel = 0, target = null, hover = false, dragging = false, lastX = 0, lastT = 0, moved = 0;
    let radius = 0, front = -1, idleTimer = 0;
    const links = captions.map((c) => $("a", c).getAttribute("href"));

    const layout = () => {
      const w = cards[0].offsetWidth;
      const gap = w * 0.4; // 正面カードを拡大しても重ならない間隔
      radius = (N * (w + gap)) / (2 * Math.PI);
      // 画面が狭いときは、リングが大きすぎないよう奥へずらす
      track.style.transform = `translateZ(${-radius}px) rotateX(${TILT}deg)`;
    };
    const norm = (a) => ((a % 360) + 540) % 360 - 180; // -180〜180
    const render = () => {
      let best = 0, bestCos = -2;
      cards.forEach((c, i) => {
        const a = i * STEP + rot;
        const cos = Math.cos((a * Math.PI) / 180);
        // 正面に近いほど拡大（となりのカードの位置で等倍に戻る）
        const near = Math.max(0, (cos - COS_STEP) / (1 - COS_STEP));
        const scale = 1 + ZOOM * near * near * (3 - 2 * near);
        c.style.transform = `rotateY(${a}deg) translateZ(${radius}px) scale(${scale.toFixed(3)})`;
        const face = c.querySelector(".p-ring__face");
        face.style.setProperty("--fade", ((1 - cos) / 2 * 0.6).toFixed(3));
        // 奥へ回るほどぼかす（正面と両どなりはくっきり）
        face.style.setProperty("--blur", (Math.max(0, 0.55 - cos) / 1.55 * BLUR).toFixed(1) + "px");
        c.style.zIndex = Math.round(cos * 100) + 100;
        if (cos > bestCos) { bestCos = cos; best = i; }
      });
      if (best !== front) {
        if (front >= 0) cards[front].classList.remove("is-front");
        cards[best].classList.add("is-front");
        front = best;
        const idx = parseInt(cards[best].dataset.index, 10);
        captions.forEach((c) => (c.hidden = parseInt(c.dataset.index, 10) !== idx));
        if (current) current.textContent = idx + 1;
      }
    };
    // 一番近いカードの角度へ合わせる
    const snapTarget = (dir = 0) => {
      const k = Math.round(-rot / STEP) + dir;
      return -k * STEP;
    };
    let prev = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      if (!dragging) {
        if (target !== null) {
          // 目標の角度へなめらかに近づく
          const d = target - rot;
          rot += d * Math.min(1, dt * 7);
          if (Math.abs(d) < 0.05) { rot = target; target = null; }
        } else if (Math.abs(vel) > 2) {
          // ドラッグを離したあとの慣性
          rot += vel * dt;
          vel *= Math.pow(0.12, dt);
          if (Math.abs(vel) <= 2) target = snapTarget();
        } else if (!hover && !reduceMotion && Date.now() > idleTimer) {
          rot -= DRIFT * dt; // ゆっくり左へ回り続ける
        }
      }
      render();
      requestAnimationFrame(tick);
    };

    // ドラッグ・スワイプ
    viewport.addEventListener("pointerdown", (e) => {
      dragging = true; moved = 0; vel = 0; target = null;
      lastX = e.clientX; lastT = performance.now();
      ring.classList.add("is-dragging");
    });
    window.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX, t = performance.now();
      const deg = dx * (180 / (Math.PI * radius)) * 0.9;
      rot += deg; moved += Math.abs(dx);
      vel = deg / Math.max(0.016, (t - lastT) / 1000) * 0.6 + vel * 0.4;
      lastX = e.clientX; lastT = t;
    });
    window.addEventListener("pointerup", () => {
      if (!dragging) return;
      dragging = false; ring.classList.remove("is-dragging");
      idleTimer = Date.now() + 2500; // 手で回したあと少し待ってから自動回転に戻る
      if (Math.abs(vel) <= 2) target = snapTarget();
    });
    // カードを押す：正面なら商品ページへ、それ以外なら正面へ回す
    cards.forEach((c, i) => {
      c.querySelector(".p-ring__face").addEventListener("click", () => {
        if (moved > 6) return; // ドラッグ中のクリックは無視
        flyTo(c);
      });
    });
    // カードを押す：カードが画面の中央へ大きくなりながら移動 → 上へ飛んで、商品ページへ移る
    let flying = false;
    const flyTo = (card) => {
      const href = links[parseInt(card.dataset.index, 10)];
      if (flying) return;
      if (reduceMotion || !Element.prototype.animate) { location.href = href; return; }
      flying = true; hover = true; // 回転を止める
      const face = $(".p-ring__face", card);
      const r = face.getBoundingClientRect();
      const veil = document.createElement("div");
      veil.className = "p-ring-veil";
      const clone = face.cloneNode(true);
      clone.className = "p-ring__face p-ring-fly";
      clone.removeAttribute("aria-label");
      Object.assign(clone.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      clone.style.setProperty("--tone", card.style.getPropertyValue("--tone"));
      document.body.append(veil, clone);
      card.style.visibility = "hidden";
      lenis?.stop();
      const vw = window.innerWidth, vh = window.innerHeight;
      const dx = vw / 2 - (r.left + r.width / 2), dy = vh / 2 - (r.top + r.height / 2);
      const sc = Math.min((vh * 0.66) / r.height, (vw * 0.82) / r.width);
      const grow = clone.animate(
        [{ transform: "translate(0, 0) scale(1) rotate(0deg)" }, { transform: `translate(${dx}px, ${dy}px) scale(${sc}) rotate(-2deg)`, offset: 0.85 }, { transform: `translate(${dx}px, ${dy}px) scale(${sc}) rotate(0deg)` }],
        { duration: 780, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "forwards" });
      veil.animate([{ opacity: 0 }, { opacity: 0.88 }], { duration: 780, easing: "ease-out", fill: "forwards" });
      grow.finished.then(() => {
        const up = clone.animate(
          [{ transform: `translate(${dx}px, ${dy}px) scale(${sc})` }, { transform: `translate(${dx}px, ${dy + 24}px) scale(${sc * 1.02})`, offset: 0.18 }, { transform: `translate(${dx}px, ${-vh - r.height * sc}px) scale(${sc * 0.92})` }],
          { duration: 620, easing: "cubic-bezier(.55, 0, .75, .3)", fill: "forwards" });
        veil.animate([{ opacity: 0.88 }, { opacity: 1 }], { duration: 620, fill: "forwards" });
        up.finished.then(() => {
          try { sessionStorage.setItem("tsuchinone_fly", "1"); } catch { /* noop */ }
          location.href = href;
        });
      });
      // 戻るボタンでこのページに戻ったとき、元の状態に戻す
      window.addEventListener("pageshow", () => { veil.remove(); clone.remove(); card.style.visibility = ""; flying = false; hover = false; lenis?.start(); }, { once: true });
    };
    const go = (dir) => { vel = 0; target = snapTarget(target === null ? 0 : 0) - dir * STEP; idleTimer = Date.now() + 3500; };
    $("[data-ring-prev]")?.addEventListener("click", () => go(-1));
    $("[data-ring-next]")?.addEventListener("click", () => go(1));
    ring.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "Enter") flyTo(cards[front]);
    });
    // カードの上にカーソルがあるときだけ止める（カードの外側では回り続ける）
    cards.forEach((c) => {
      const face = c.querySelector(".p-ring__face");
      face.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") hover = true; });
      face.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hover = false; });
    });

    layout();
    window.addEventListener("resize", layout);
    requestAnimationFrame(tick);
    // 画面に入ったら、カードが1枚ずつせり上がって登場
    cards.forEach((c, i) => c.style.setProperty("--in-delay", `${(i % N) * 0.06}s`));
    const showRing = () => ring.classList.add("is-in");
    if ("IntersectionObserver" in window) {
      const o = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { showRing(); o.disconnect(); } }, { threshold: 0.2 });
      o.observe(ring);
    } else showRing();
  });

  /* ---------- 想い：写真と文章のスライドショー ----------
     止まらずに一定の間隔で切り替え続ける（ホバーでは止めない）。
     経過時間は requestAnimationFrame で数えるので、タイマーのずれや二重起動が起きない。 */
  $$("[data-slides]").forEach((box) => {
    const photos = $$(".p-thought__media", box);
    const slides = $$(".p-thought__slide", box);
    const dots = $$(".p-thought__dots button", box);
    const DUR = 4000; // 切り替えの間隔（ミリ秒）
    box.style.setProperty("--dur", `${DUR / 1000}s`);
    let i = 0, elapsed = 0, last = performance.now();
    const show = (n) => {
      i = (n + slides.length) % slides.length;
      elapsed = 0;
      [photos, slides].forEach((list) => list.forEach((el, k) => el.classList.toggle("is-active", k === i)));
      dots.forEach((d, k) => {
        d.setAttribute("aria-selected", String(k === i));
        // バーのアニメーションを最初から
        const bar = d.firstElementChild; bar.style.animation = "none"; void bar.offsetWidth; bar.style.animation = "";
      });
    };
    const loop = (now) => {
      // タブが裏にある間などで大きく時間が飛んだときは、1回分だけ進める
      elapsed += Math.min(now - last, 100);
      last = now;
      if (elapsed >= DUR) show(i + 1);
      requestAnimationFrame(loop);
    };
    dots.forEach((d, k) => d.addEventListener("click", () => show(k)));
    // 画面に入ったときに1枚目から再生する
    if ("IntersectionObserver" in window) {
      let seen = false;
      new IntersectionObserver((es) => {
        if (es[0].isIntersecting && !seen) { seen = true; show(0); }
      }, { threshold: 0.3 }).observe(box);
    }
    requestAnimationFrame(loop);
  });

  /* ---------- 生産者の横スクロール ---------- */
  $$("[data-hscroll]").forEach((wrap) => {
    const track = $(".p-farmers__track", wrap);
    const prev = $("[data-prev]", wrap);
    const next = $("[data-next]", wrap);
    if (!track) return;
    const step = () => ($(".c-farmer", track)?.offsetWidth || 280) + 24;
    const update = () => {
      if (prev) prev.disabled = track.scrollLeft < 8;
      if (next) next.disabled = track.scrollLeft + track.clientWidth > track.scrollWidth - 8;
    };
    prev?.addEventListener("click", () => track.scrollBy({ left: -step(), behavior: reduceMotion ? "auto" : "smooth" }));
    next?.addEventListener("click", () => track.scrollBy({ left: step(), behavior: reduceMotion ? "auto" : "smooth" }));
    track.addEventListener("scroll", update, { passive: true });
    update();
  });

  /* ---------- 旬の野菜カレンダー（中身は仮） ---------- */
  const SEASON = {
    1: [["daikon", "大根"], ["turnip", "かぶ"], ["cabbage", "キャベツ"], ["spinach", "ほうれん草"], ["broccoli", "ブロッコリー"], ["negi", "ねぎ"]],
    2: [["daikon", "大根"], ["spinach", "ほうれん草"], ["broccoli", "ブロッコリー"], ["negi", "ねぎ"], ["nanohana", "菜の花"], ["carrot", "人参"]],
    3: [["nanohana", "菜の花"], ["cabbage", "春キャベツ"], ["onion", "新玉ねぎ"], ["spinach", "ほうれん草"], ["turnip", "かぶ"], ["snappea", "スナップえんどう"]],
    4: [["onion", "新玉ねぎ"], ["snappea", "スナップえんどう"], ["cabbage", "春キャベツ"], ["turnip", "かぶ"], ["carrot", "人参"], ["nanohana", "菜の花"]],
    5: [["snappea", "スナップえんどう"], ["onion", "玉ねぎ"], ["potato", "じゃがいも"], ["cucumber", "きゅうり"], ["cabbage", "キャベツ"], ["carrot", "人参"]],
    6: [["cucumber", "きゅうり"], ["tomato", "トマト"], ["potato", "じゃがいも"], ["eggplant", "なす"], ["piman", "ピーマン"], ["edamame", "枝豆"]],
    7: [["tomato", "トマト"], ["eggplant", "なす"], ["cucumber", "きゅうり"], ["piman", "ピーマン"], ["edamame", "枝豆"], ["pumpkin", "かぼちゃ"]],
    8: [["tomato", "トマト"], ["eggplant", "なす"], ["piman", "ピーマン"], ["pumpkin", "かぼちゃ"], ["edamame", "枝豆"], ["cucumber", "きゅうり"]],
    9: [["pumpkin", "かぼちゃ"], ["sweetpotato", "さつまいも"], ["eggplant", "なす"], ["piman", "ピーマン"], ["potato", "じゃがいも"], ["negi", "ねぎ"]],
    10: [["sweetpotato", "さつまいも"], ["pumpkin", "かぼちゃ"], ["carrot", "人参"], ["potato", "じゃがいも"], ["turnip", "かぶ"], ["spinach", "ほうれん草"]],
    11: [["carrot", "人参"], ["daikon", "大根"], ["turnip", "かぶ"], ["sweetpotato", "さつまいも"], ["broccoli", "ブロッコリー"], ["spinach", "ほうれん草"]],
    12: [["daikon", "大根"], ["carrot", "人参"], ["cabbage", "キャベツ"], ["negi", "ねぎ"], ["broccoli", "ブロッコリー"], ["spinach", "ほうれん草"]],
  };
  const cal = $("[data-calendar]");
  if (cal) {
    const tabs = $(".p-calendar__tabs", cal);
    const slides = $(".p-calendar__slides", cal);
    // 季節ごとにまとめて「3月」「4月」…と表示。今月には「今月」の印をつける
    const GROUPS = [["春", "Spring", [3, 4, 5]], ["夏", "Summer", [6, 7, 8]], ["秋", "Autumn", [9, 10, 11]], ["冬", "Winter", [12, 1, 2]]];
    const ORDER = GROUPS.flatMap((g) => g[2]);
    const now = new Date().getMonth() + 1;
    const seasonOf = (m) => GROUPS.find((g) => g[2].includes(m));
    tabs.innerHTML = GROUPS.map(([jp, en, ms]) => `
      <div class="p-calendar__season" role="presentation">
        <p class="p-calendar__season-name" aria-hidden="true">${jp}<span>${en}</span></p>
        <div class="p-calendar__months" role="presentation">${ms.map((m) => `<button type="button" role="tab" id="cal-tab-${m}" aria-controls="cal-panel-${m}" aria-selected="false"><span class="num">${m}</span>月${m === now ? '<em class="p-calendar__now">今月</em>' : ""}</button>`).join("")}</div>
      </div>`).join("");
    slides.innerHTML = Array.from({ length: 12 }, (_, i) => `
      <ul class="p-calendar__slide" role="tabpanel" id="cal-panel-${i + 1}" aria-labelledby="cal-tab-${i + 1}">
        <li class="p-calendar__head"><span class="num">${i + 1}</span>月においしい野菜<small>${seasonOf(i + 1)[0]}の野菜</small></li>
        ${SEASON[i + 1].map(([k, n]) => `<li class="p-calendar__veg"><img src="images/photo/fv/veg-${k}.webp" onerror="this.onerror=null;this.src='images/illust/veg-${k}.svg'" alt="">${esc(n)}</li>`).join("")}
      </ul>`).join("");
    const btn = (m) => $(`#cal-tab-${m}`, tabs);
    const show = (m) => {
      ORDER.forEach((k) => { const b = btn(k); b.setAttribute("aria-selected", String(k === m)); b.tabIndex = k === m ? 0 : -1; });
      $$(".p-calendar__slide", slides).forEach((s, i) => s.setAttribute("aria-hidden", String(i + 1 !== m)));
      slides.style.transform = `translateX(${-(m - 1) * 100}%)`;
    };
    tabs.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) show(parseInt(b.id.replace("cal-tab-", ""), 10)); });
    tabs.addEventListener("keydown", (e) => {
      if (!["ArrowRight", "ArrowLeft"].includes(e.key)) return;
      const cur = ORDER.findIndex((k) => btn(k).getAttribute("aria-selected") === "true");
      const n = ORDER[(cur + (e.key === "ArrowRight" ? 1 : -1) + 12) % 12];
      show(n); btn(n).focus();
    });
    show(new Date().getMonth() + 1);
  }

  /* ---------- 野菜のループ帯（中身を2周分に複製） ---------- */
  // 画像の読み込みを待って1セットの幅を測り、画面幅より長くなるまで複製してから
  // requestAnimationFrame で一定速度で流す（CSSアニメーションの -50% だと、
  // 画面が広いときや画像の読み込み前に幅がずれて、何も映らない時間ができるため）
  $$("[data-loop]").forEach((track) => {
    const dur = parseFloat(track.dataset.loop) || 40; // 1セットが流れきる秒数
    const pauseOnHover = track.hasAttribute("data-loop-pause");
    const original = Array.from(track.children);
    const imgs = $$("img", track);
    const ready = Promise.all(imgs.map((im) => (im.complete ? Promise.resolve() : new Promise((r) => { im.addEventListener("load", r, { once: true }); im.addEventListener("error", r, { once: true }); }))));
    let setW = 0, x = 0, last = 0, hover = false, visible = true, started = false;
    const measure = () => {
      // 複製を一度取り除いて1セット分の幅（gapを含む）を測る
      Array.from(track.children).forEach((el) => { if (!original.includes(el)) el.remove(); });
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      setW = track.scrollWidth + gap;
      const need = Math.ceil((track.parentElement.offsetWidth + setW) / setW) + 1;
      for (let k = 1; k < need; k++) original.forEach((el) => track.appendChild(el.cloneNode(true)));
      x = (x % setW) - (x % setW === 0 ? setW : 0); // 左側に1セット分ずらしておく（右へ流しても途切れない）
    };
    const tick = (now) => {
      const dt = last ? Math.min(now - last, 100) / 1000 : 0; last = now;
      if (visible && !hover && setW) {
        // 左から右へ流す
        x += (setW / dur) * dt;
        if (x >= 0) x -= setW;
        track.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
      }
      requestAnimationFrame(tick);
    };
    ready.then(() => {
      measure();
      if (!started) { started = true; requestAnimationFrame(tick); }
    });
    let rt = 0;
    addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(measure, 200); });
    if (pauseOnHover) {
      track.parentElement.addEventListener("mouseenter", () => (hover = true));
      track.parentElement.addEventListener("mouseleave", () => (hover = false));
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(track.parentElement);
    }
  });

  /* ---------- FAQ アコーディオン ---------- */
  $$(".c-faq__q").forEach((q) => {
    q.addEventListener("click", () => q.setAttribute("aria-expanded", String(q.getAttribute("aria-expanded") !== "true")));
  });
  const faqFilter = $("[data-faq-filter]");
  if (faqFilter) {
    faqFilter.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      $$("button", faqFilter).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      $$("[data-faq-group]").forEach((g) => (g.hidden = !(b.dataset.cat === "all" || g.dataset.faqGroup === b.dataset.cat)));
    });
  }

  /* ---------- お知らせの絞り込み ---------- */
  const newsFilter = $("[data-news-filter]");
  if (newsFilter) {
    newsFilter.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      $$("button", newsFilter).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      $$(".p-news__item").forEach((it) => (it.hidden = !(b.dataset.cat === "all" || it.dataset.cat === b.dataset.cat)));
    });
  }

  /* ---------- フォームの入力チェック ---------- */
  const validate = (form) => {
    let ok = true;
    $$("[data-required]", form).forEach((field) => {
      const input = $("input, select, textarea", field);
      let valid = input.value.trim() !== "";
      if (valid && input.type === "email") valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim());
      if (valid && input.type === "tel" && input.value) valid = /^[0-9\-+() ]{10,14}$/.test(input.value.trim());
      field.classList.toggle("is-error", !valid);
      input.setAttribute("aria-invalid", String(!valid));
      if (!valid) ok = false;
    });
    const tel = $("input[type=tel]", form);
    if (tel && tel.value && !tel.closest("[data-required]")) {
      const v = /^[0-9\-+() ]{10,14}$/.test(tel.value.trim());
      tel.closest(".c-form__field").classList.toggle("is-error", !v);
      if (!v) ok = false;
    }
    if (!ok) $(".is-error input, .is-error select, .is-error textarea", form)?.focus();
    return ok;
  };
  const contactForm = $("#contact-form");
  if (contactForm) {
    contactForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!validate(contactForm)) return;
      $(".p-contact__done").classList.add("is-show");
      smoothTo($(".p-contact__done"), { offset: window.innerHeight / 3 });
      toast("お問い合わせを送信しました");
    });
    $$("input, select, textarea", contactForm).forEach((el) => el.addEventListener("input", () => el.closest(".c-form__field")?.classList.remove("is-error")));
  }

  /* ---------- 購入手続き（デモ） ---------- */
  const checkout = $("#checkout-form");
  if (checkout) {
    const dateSel = $("#delivery-date", checkout);
    const today = new Date();
    for (let i = 3; i <= 10; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      const w = "日月火水木金土"[d.getDay()];
      dateSel.insertAdjacentHTML("beforeend", `<option>${d.getMonth() + 1}月${d.getDate()}日（${w}）</option>`);
    }
    checkout.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!cart.length) { toast("カートに商品が入っていません"); return; }
      if (!validate(checkout)) return;
      // 定期便を申し込んだら、マイページの「定期便の管理」に反映する
      const subItem = cart.find(isSub);
      if (subItem) {
        try { localStorage.setItem("tsuchinone_sub", JSON.stringify({ plan: subItem.name, interval: subItem.mode === "weekly" ? "毎週" : "隔週", skip: false, active: true })); } catch { /* noop */ }
      }
      $(".p-checkout__done [data-done-sub]").hidden = !subItem;
      // 注文が済んだらカートを空にする
      cart.length = 0; saveCart(); renderCart();
      $(".p-checkout__done").hidden = false;
      smoothTo($(".p-checkout__done"), { offset: window.innerHeight / 3 });
      toast("ご注文を受け付けました");
    });
  }

  /* ---------- 定期便のお申し込み（plan.html） ----------
     セットとお届け間隔を選ぶ → 右（スマホは下）の内容が変わる → カートに入れてカートページへ。
     plan.html?set=set-m で最初に選ぶセットを指定、plan.html?edit=〇〇 でカートの定期便を変更 */
  const planForm = $("[data-plan]");
  if (planForm) {
    const q = new URLSearchParams(location.search);
    const editKey = q.get("edit");
    const editing = editKey ? cart.find((i) => i.key === editKey) : null;
    const pick = (name, val) => { const r = $(`input[name="${name}"][value="${val}"]`, planForm); if (r) r.checked = true; };
    if (editing) { pick("plan-set", editing.id); pick("plan-interval", editing.mode); }
    else if (q.get("set")) pick("plan-set", q.get("set"));
    const submit = $("[data-plan-submit] span", planForm);
    if (editing && submit) submit.firstChild.textContent = "この内容に変更する";
    const update = () => {
      const set = $('input[name="plan-set"]:checked', planForm);
      const iv = $('input[name="plan-interval"]:checked', planForm);
      const base = Number(set.dataset.price);
      const price = Math.round(base * SUB_OFF);
      const times = iv.value === "weekly" ? 4 : 2;
      $("[data-plan-name]").textContent = set.dataset.name;
      $("[data-plan-interval]").textContent = MODES[iv.value].replace("定期便・", "");
      $("[data-plan-base]").textContent = yen(base);
      $("[data-plan-price]").textContent = yen(price);
      $("[data-plan-month]").textContent = `${yen(price * times)}（${times}回分・送料別）`;
    };
    planForm.addEventListener("change", update);
    update();
    planForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await loadData();
      const p = setInfo($('input[name="plan-set"]:checked', planForm).value);
      if (!p) return;
      if (editing) cart = cart.filter((i) => i.key !== editKey);
      putItem(p, $('input[name="plan-interval"]:checked', planForm).value);
      saveCart();
      try { sessionStorage.setItem("tsuchinone_toast", editing ? "定期便の内容を変更しました" : "定期便をカートに入れました"); } catch { /* noop */ }
      location.href = "cart.html";
    });
  }
  // ページを移動したあとに出すお知らせ
  try {
    const t = sessionStorage.getItem("tsuchinone_toast");
    if (t) { sessionStorage.removeItem("tsuchinone_toast"); setTimeout(() => toast(t), 400); }
  } catch { /* noop */ }

  /* ---------- マイページ（デモ） ---------- */
  const SUB_KEY = "tsuchinone_sub";
  const mypage = $("[data-mypage]");
  if (mypage) {
    const fmt = (d) => `${d.getMonth() + 1}月${d.getDate()}日（${"日月火水木金土"[d.getDay()]}）`;
    const base = new Date(); base.setDate(base.getDate() + 5);
    let sub;
    try { sub = JSON.parse(localStorage.getItem(SUB_KEY)); } catch { sub = null; }
    sub = sub || { plan: "旬の野菜セット M", interval: "隔週", skip: false, active: true };
    const save = () => { try { localStorage.setItem(SUB_KEY, JSON.stringify(sub)); } catch { /* noop */ } };
    const render = () => {
      const next = new Date(base);
      if (sub.skip) next.setDate(next.getDate() + (sub.interval === "毎週" ? 7 : 14));
      $("[data-sub-plan]").textContent = sub.plan;
      $("[data-sub-interval]").textContent = sub.interval;
      $("[data-sub-next]").textContent = sub.active ? fmt(next) + (sub.skip ? "（1回お休み後）" : "") : "—";
      $("[data-sub-state]").textContent = sub.active ? "お届け中" : "解約済み";
      $("#interval-select").value = sub.interval;
      $("[data-skip]").textContent = sub.skip ? "お休みを取り消す" : "次回のお届けをお休みする";
      $$("[data-sub-active]").forEach((el) => (el.hidden = !sub.active));
      $("[data-sub-cancelled]").hidden = sub.active;
    };
    $("[data-save-interval]").addEventListener("click", () => { sub.interval = $("#interval-select").value; save(); render(); toast(`お届け間隔を「${sub.interval}」に変更しました`); });
    $("[data-skip]").addEventListener("click", () => { sub.skip = !sub.skip; save(); render(); toast(sub.skip ? "次回のお届けをお休みにしました" : "お休みを取り消しました"); });
    $("[data-cancel-open]").addEventListener("click", () => { $("[data-cancel-confirm]").hidden = false; $("[data-cancel-confirm] button").focus(); });
    $("[data-cancel-back]").addEventListener("click", () => ($("[data-cancel-confirm]").hidden = true));
    $("[data-cancel-do]").addEventListener("click", () => { sub.active = false; save(); $("[data-cancel-confirm]").hidden = true; render(); toast("定期便を解約しました"); });
    $("[data-restart]").addEventListener("click", () => { sub = { plan: "旬の野菜セット M", interval: "隔週", skip: false, active: true }; save(); render(); toast("定期便を再開しました"); });
    render();
  }

  /* ---------- 取引先の飲食店：奥行きのあるカルーセル ----------
     カードは右奥へ重なって並び、奥ほど暗く・ぼけて見える。
     ドラッグ・矢印・キーボード（←→）・ドット・カードのクリックで切り替え、4.5秒ごとに自動で進む */
  $$("[data-depth]").forEach((root) => {
    const cards = $$("[data-depth-card]", root);
    const msgs = $$("[data-depth-msg]", root);
    const dotsEl = $("[data-depth-dots]", root);
    const viewport = $(".p-depth__viewport", root);
    const n = cards.length;
    if (!n) return;
    const CFG = { depth: 220, spread: 90, tilt: 22, visible: 4, falloff: .16, blur: 5, duration: 700, auto: 4500 };
    let pos = 0, focus = 0, anim = null, scale = 1, drag = null, timer = 0, inView = false;
    const wrap = (d) => { d = ((d % n) + n) % n; return d > n / 2 ? d - n : d; };
    const layout = () => {
      cards.forEach((el, i) => {
        const d = wrap(i - pos);
        const back = Math.max(0, d), shown = Math.abs(d) <= CFG.visible + .5;
        let op = d < 0 ? Math.max(0, 1 + d) : 1; if (!shown) op = 0;
        const ry = CFG.tilt * Math.min(Math.max(d, 0), 1);
        el.style.transform = `translate(-50%, -50%) scale(${scale}) translateX(${(CFG.spread * d).toFixed(1)}px) translateZ(${(-CFG.depth * d).toFixed(1)}px) rotateY(${(-ry).toFixed(2)}deg)`;
        el.style.opacity = op.toFixed(3);
        el.style.filter = `brightness(${Math.max(.55, 1 - back * CFG.falloff * .6).toFixed(3)}) blur(${Math.min(CFG.blur, back / CFG.visible * CFG.blur).toFixed(2)}px)`;
        el.style.zIndex = String(Math.round(2000 - d * 20));
        el.style.pointerEvents = shown && op > .05 ? "auto" : "none";
        const t = $(".p-depth__tint", el); if (t) t.style.opacity = Math.min(back * CFG.falloff * 1.2, .7).toFixed(3);
      });
    };
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const tweenTo = (target, animate = true) => {
      if (anim) cancelAnimationFrame(anim);
      const from = pos, t0 = performance.now(), dur = animate && !reduceMotion ? CFG.duration : 0;
      const step = (now) => {
        const k = dur ? Math.min(1, (now - t0) / dur) : 1;
        pos = from + (target - from) * ease(k); layout();
        if (k < 1) anim = requestAnimationFrame(step); else { pos = ((pos % n) + n) % n; layout(); anim = null; }
      };
      anim = requestAnimationFrame(step);
    };
    dotsEl.innerHTML = cards.map((_, i) => `<button type="button" aria-label="${i + 1}番目のお店"></button>`).join("");
    const dots = $$("button", dotsEl);
    const setFocus = (idx, animate = true) => {
      idx = ((idx % n) + n) % n;
      tweenTo(pos + wrap(idx - pos), animate);
      focus = idx;
      dots.forEach((d, i) => d.setAttribute("aria-current", String(i === idx)));
      msgs.forEach((m, i) => (m.hidden = i !== idx));
      cards.forEach((c, i) => c.setAttribute("aria-hidden", String(i !== idx)));
      restart();
    };
    const restart = () => { clearInterval(timer); if (!reduceMotion && inView) timer = setInterval(() => setFocus(focus + 1), CFG.auto); };
    $("[data-depth-prev]", root).addEventListener("click", () => setFocus(focus - 1));
    $("[data-depth-next]", root).addEventListener("click", () => setFocus(focus + 1));
    dots.forEach((d, i) => d.addEventListener("click", () => setFocus(i)));
    cards.forEach((c, i) => c.addEventListener("click", () => { if (!drag || !drag.moved) setFocus(i); }));
    root.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); setFocus(focus - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); setFocus(focus + 1); }
    });
    // ドラッグ（指でもマウスでも）
    viewport.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      if (anim) cancelAnimationFrame(anim);
      drag = { x: e.clientX, start: pos, lastX: e.clientX, lastT: performance.now(), v: 0, moved: false, id: e.pointerId };
    });
    viewport.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 4) { drag.moved = true; viewport.setPointerCapture(drag.id); root.classList.add("is-dragging"); clearInterval(timer); }
      if (!drag.moved) return;
      const now = performance.now();
      drag.v = (e.clientX - drag.lastX) / Math.max(now - drag.lastT, 1); drag.lastX = e.clientX; drag.lastT = now;
      pos = drag.start - dx / Math.max(cards[0].offsetWidth * .55 * scale, 40); layout();
    });
    const end = () => {
      if (!drag) return;
      const d = drag; root.classList.remove("is-dragging");
      if (d.moved) setFocus(Math.round(pos - (d.v * 180) / Math.max(cards[0].offsetWidth * .55 * scale, 40)));
      setTimeout(() => (drag = null), 0);
    };
    viewport.addEventListener("pointerup", end);
    viewport.addEventListener("pointercancel", end);
    // 画面幅に合わせて全体を縮める
    const fit = () => { const sp = innerWidth < 768; CFG.spread = sp ? 34 : 110; CFG.depth = sp ? 140 : 260; scale = Math.min(1, Math.max(.6, viewport.offsetWidth / (cards[0].offsetWidth + CFG.spread * 2.4 + (sp ? 0 : 120)))); layout(); };
    addEventListener("resize", fit);
    // 画面に入っているあいだだけ自動で進める
    if ("IntersectionObserver" in window) new IntersectionObserver((es) => { inView = es[0].isIntersecting; restart(); }, { threshold: .3 }).observe(root);
    fit(); setFocus(0, false);
  });

  /* ---------- 見出しを1行に収める（PC・タブレット） ----------
     見出しは折り返さずに1行で表示し、入りきらないときは文字を少しだけ小さくする（最小で元の62%・14px）。
     それでも入らない長い見出し（記事タイトルなど）は、ふつうに折り返す。スマホは意味の区切りで改行する */
  const fitHeadings = () => {
    const pc = innerWidth >= 768;
    const plan = [];
    $$("h1, h2, h3").forEach((h) => {
      if (h.closest(".c-logo, .c-modal, .c-cart, [hidden]")) return;
      h.style.fontSize = ""; h.style.whiteSpace = ""; h.style.maxWidth = "";
      if (!pc || !h.offsetParent) return;
      const avail = h.clientWidth; // 折り返した状態で使える幅（カードの幅を広げないよう、先に測る）
      h.style.maxWidth = `${avail}px`;
      h.style.whiteSpace = "nowrap";
      const need = h.scrollWidth, base = parseFloat(getComputedStyle(h).fontSize);
      const k = need <= avail + 1 ? 1 : avail / need;
      // カードが並ぶところ（同じリスト内）は、見出しの大きさをそろえる
      const group = h.closest("ul, ol, [data-stagger], .p-plans, .p-depth, .p-thought__slides") || h;
      plan.push({ h, base, k, group });
    });
    const groupK = new Map();
    plan.forEach(({ group, k }) => groupK.set(group, Math.min(groupK.get(group) ?? 1, k)));
    plan.forEach(({ h, base, group }) => {
      const k = groupK.get(group);
      if (k >= 1) return;
      const fs = base * k * .985;
      if (k >= .62 && fs >= 14) h.style.fontSize = `${fs.toFixed(2)}px`; // 元の62%・14pxより小さくはしない
      else { h.style.whiteSpace = ""; h.style.maxWidth = ""; }
    });
  };
  (document.fonts?.ready || Promise.resolve()).then(fitHeadings);
  let fitTimer = 0;
  addEventListener("resize", () => { clearTimeout(fitTimer); fitTimer = setTimeout(fitHeadings, 150); });

  /* ---------- ログイン・新規会員登録 ----------
     ログイン（または会員登録）するとマイページへ進む。ログインしていない状態でマイページを開くと、ログイン画面へ移動する。
     ※ 公開時は、会員管理のサービス（ECカートなど）のログイン処理につなぎます */
  const LOGIN_KEY = "tsuchinone_login";
  const isLoggedIn = () => { try { return sessionStorage.getItem(LOGIN_KEY) === "1" || localStorage.getItem(LOGIN_KEY) === "1"; } catch { return false; } };
  const setLogin = (keep) => { try { sessionStorage.setItem(LOGIN_KEY, "1"); if (keep) localStorage.setItem(LOGIN_KEY, "1"); } catch { /* noop */ } };
  ["#login-form", "#register-form"].forEach((sel) => {
    const f = $(sel);
    if (!f) return;
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!validate(f)) return;
      setLogin(sel === "#register-form" || $("[name=keep]", f)?.checked);
      toast(sel === "#register-form" ? "会員登録が完了しました" : "ログインしました");
      setTimeout(() => (location.href = "mypage.html"), 600);
    });
    $$("input", f).forEach((el) => el.addEventListener("input", () => el.closest(".c-form__field")?.classList.remove("is-error")));
  });
  if (page === "mypage" && !isLoggedIn()) location.replace("login.html");
  $("[data-logout]")?.addEventListener("click", () => {
    try { sessionStorage.removeItem(LOGIN_KEY); localStorage.removeItem(LOGIN_KEY); } catch { /* noop */ }
    location.href = "login.html";
  });
  // ログイン中は、ヘッダーの人のアイコンからマイページへ直接進む
  if (isLoggedIn()) $$(".c-user-btn").forEach((a) => { a.href = "mypage.html"; a.setAttribute("aria-label", "マイページ"); });

  /* ---------- 実行 ---------- */
  renderProducts().then(() => { if (page === "products") initProductFilter(); });
})();
