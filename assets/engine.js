/*
 * AutoCensoR homepage interaction engine (shared, data-attribute driven).
 *
 * Works on file:// with no server. Every component is optional and self-inits
 * only when its markup is present, so the same engine drives six different
 * layouts. No external libraries, no build step.
 *
 * Honesty guarantees baked in here:
 *   - Protection-style preview keeps ONE fixed region and only changes the fill
 *     (solid / grayscale / blur / mosaic). Style choice never resizes the region.
 *   - Detection-sensitivity demo is a SEPARATE candidate-detection diagram. A
 *     lower threshold reveals MORE / wider candidate outlines (more sensitive).
 *     It never shrinks the protection region.
 *   - The before/after slider is a real draggable control (pointer + touch +
 *     mouse + keyboard), never a static hardcoded handle.
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ utils */
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };
  var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  var isEnglish = function () {
    return (document.documentElement.lang || "").toLowerCase().indexOf("en") === 0;
  };
  var reduceMotion = function () {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  };

  function accent(el) {
    var v = getComputedStyle(el || document.documentElement)
      .getPropertyValue("--ac-accent");
    return (v && v.trim()) || "#2dd4bf";
  }
  function accentInk(el) {
    var v = getComputedStyle(el || document.documentElement)
      .getPropertyValue("--ac-accent-ink");
    return (v && v.trim()) || "#0c1116";
  }

  function resolvePath(obj, path) {
    return path.split(".").reduce(function (acc, k) {
      return acc == null ? undefined : acc[k];
    }, obj);
  }

  /* --------------------------------------------------------- site data load */
  function readInlineData() {
    var node = document.getElementById("ac-site-data");
    if (!node) return null;
    try { return JSON.parse(node.textContent); } catch (e) { return null; }
  }

  function loadSiteData() {
    // Inline copy is the file:// safe source of truth and is always present.
    var inline = readInlineData();
    if (inline) return Promise.resolve(inline);
    // Fall back to the canonical JSON file when served over http(s).
    return fetch("site-data.json")
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; });
  }

  function bindData(data) {
    // Text bindings: <span data-ac-text="brand.name"></span>
    $$("[data-ac-text]").forEach(function (el) {
      var val = resolvePath(data, el.getAttribute("data-ac-text"));
      if (val != null && val !== "") el.textContent = val;
    });
    // Link bindings: <a data-ac-href="links.github">…</a>
    $$("[data-ac-href]").forEach(function (el) {
      var val = resolvePath(data, el.getAttribute("data-ac-href"));
      if (val) {
        el.setAttribute("href", val);
        el.removeAttribute("aria-disabled");
      } else {
        // No value configured -> hide the optional control entirely.
        var host = el.closest("[data-ac-optional]") || el;
        host.hidden = true;
      }
    });
    // Year stamp
    $$("[data-ac-year]").forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });
  }

  /* ---------------------------------------------------- demo scene renderer */
  // A deliberately abstract, illustrative "image to protect": never a real
  // photo and never an app screenshot. Drawn programmatically so canvas pixel
  // ops stay clean on file:// (no cross-origin taint).
  function drawScene(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    // backdrop gradient
    var g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#e9eef3");
    g.addColorStop(0.55, "#cdd7e0");
    g.addColorStop(1, "#aab8c6");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // soft sun disc
    var sun = ctx.createRadialGradient(w * 0.74, h * 0.30, 6, w * 0.74, h * 0.30, w * 0.28);
    sun.addColorStop(0, "rgba(255,236,196,0.95)");
    sun.addColorStop(1, "rgba(255,236,196,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, h);

    // rolling horizon bands
    var bands = [
      ["#7fa9b6", 0.62], ["#6c97a8", 0.72], ["#577f93", 0.83], ["#41617a", 1.0],
    ];
    bands.forEach(function (b, i) {
      ctx.fillStyle = b[0];
      ctx.beginPath();
      ctx.moveTo(0, h * b[1]);
      var amp = 14 + i * 6;
      for (var x = 0; x <= w; x += 12) {
        ctx.lineTo(x, h * b[1] + Math.sin((x / w) * Math.PI * (1.5 + i * 0.4) + i) * amp);
      }
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
    });

    // the "subject" card that sits inside the protected region
    var cx = w * 0.5, cy = h * 0.52;
    ctx.save();
    ctx.shadowColor = "rgba(20,30,40,0.35)";
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 10;
    roundRect(ctx, cx - w * 0.16, cy - h * 0.20, w * 0.32, h * 0.40, 18);
    ctx.fillStyle = "#f4ede2";
    ctx.fill();
    ctx.restore();
    // a few stripes / a circle to give the card recognisable detail
    ctx.fillStyle = "#e3b04b";
    ctx.beginPath();
    ctx.arc(cx, cy - h * 0.05, w * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#cf5b4a";
    roundRect(ctx, cx - w * 0.10, cy + h * 0.06, w * 0.20, h * 0.05, 6);
    ctx.fill();
    ctx.fillStyle = "#5a8f7b";
    roundRect(ctx, cx - w * 0.10, cy + h * 0.13, w * 0.13, h * 0.035, 5);
    ctx.fill();

    // tiny "데모" watermark so it's never mistaken for an app capture
    ctx.fillStyle = "rgba(20,28,38,0.42)";
    ctx.font = "600 13px ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "bottom";
    ctx.fillText(isEnglish() ? "Demo image" : "데모 · 예시 이미지", 14, h - 12);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // The single fixed protected region (as a fraction of canvas size).
  function regionOf(w, h) {
    return { x: w * 0.34, y: h * 0.30, w: w * 0.32, h: h * 0.44 };
  }

  function applyGrayscale(ctx, r) {
    var off = document.createElement("canvas");
    off.width = Math.round(r.w); off.height = Math.round(r.h);
    var o = off.getContext("2d");
    o.filter = "grayscale(1) contrast(0.96)";
    o.drawImage(ctx.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    ctx.drawImage(off, 0, 0, r.w, r.h, r.x, r.y, r.w, r.h);
  }
  function applyBlur(ctx, r) {
    var off = document.createElement("canvas");
    off.width = Math.round(r.w); off.height = Math.round(r.h);
    var o = off.getContext("2d");
    o.filter = "blur(7px)";
    // draw a slightly expanded source so blurred edges fill the region
    o.drawImage(ctx.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    ctx.drawImage(off, 0, 0, r.w, r.h, r.x, r.y, r.w, r.h);
  }
  function applyMosaic(ctx, r, block) {
    block = block || 13;
    var sw = Math.max(1, Math.round(r.w / block));
    var sh = Math.max(1, Math.round(r.h / block));
    var off = document.createElement("canvas");
    off.width = sw; off.height = sh;
    var o = off.getContext("2d");
    o.imageSmoothingEnabled = true;
    o.drawImage(ctx.canvas, r.x, r.y, r.w, r.h, 0, 0, sw, sh);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, sw, sh, r.x, r.y, r.w, r.h);
    ctx.imageSmoothingEnabled = true;
  }
  function applySolid(ctx, r, ink) {
    ctx.save();
    ctx.fillStyle = "#14171d";
    roundRect(ctx, r.x, r.y, r.w, r.h, 8);
    ctx.fill();
    ctx.strokeStyle = ink || "#2dd4bf";
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;
    roundRect(ctx, r.x + 4, r.y + 4, r.w - 8, r.h - 8, 6);
    ctx.stroke();
    ctx.restore();
  }

  function paintProtection(ctx, w, h, style, ink) {
    var r = regionOf(w, h);
    if (style === "solid") applySolid(ctx, r, ink);
    else if (style === "grayscale") applyGrayscale(ctx, r);
    else if (style === "blur") applyBlur(ctx, r);
    else if (style === "mosaic") applyMosaic(ctx, r, 13);
    // region outline so the *fixed* boundary is obvious across every style
    ctx.save();
    ctx.setLineDash([7, 5]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = ink || "#2dd4bf";
    roundRect(ctx, r.x, r.y, r.w, r.h, 8);
    ctx.stroke();
    ctx.restore();
  }

  /* --------------------------------------------- protection style preview */
  var STYLE_LABEL = {
    solid: ["단색(솔리드)", "Solid fill"],
    grayscale: ["흑백(그레이스케일)", "Grayscale"],
    blur: ["블러", "Blur"],
    mosaic: ["모자이크", "Mosaic"],
  };

  function initStyleDemos() {
    $$("[data-ac-style-demo]").forEach(function (demo) {
      var canvas = $("[data-ac-style-canvas]", demo);
      if (!canvas) return;
      var ctx = canvas.getContext("2d");
      var W = canvas.width || 720, H = canvas.height || 460;
      canvas.width = W; canvas.height = H;
      var ink = accent(demo);
      var caption = $("[data-ac-style-caption]", demo);
      var btns = $$("[data-ac-style]", demo);

      function render(style) {
        drawScene(ctx, W, H);
        paintProtection(ctx, W, H, style, ink);
        btns.forEach(function (b) {
          var on = b.getAttribute("data-ac-style") === style;
          b.setAttribute("aria-pressed", on ? "true" : "false");
          b.classList.toggle("is-active", on);
        });
        if (caption) {
          caption.textContent = isEnglish()
            ? STYLE_LABEL[style][1] + " applied: the protected region stays fixed; only the visual treatment changes."
            : STYLE_LABEL[style][0] + " 적용: 보호 영역 크기는 그대로, 채우는 방식만 바뀝니다.";
        }
      }

      btns.forEach(function (b) {
        b.addEventListener("click", function () {
          render(b.getAttribute("data-ac-style"));
        });
      });
      render("mosaic");
    });
  }

  /* ----------------------------------------------- sensitivity explainer */
  // Fixed pool of candidate boxes, each with a confidence. A lower threshold
  // keeps MORE candidates (wider, more sensitive net). This is the detection
  // stage and is intentionally separate from the protection style above.
  var CANDIDATES = [
    { x: 0.10, y: 0.16, w: 0.20, h: 0.26, c: 0.46 },
    { x: 0.40, y: 0.10, w: 0.22, h: 0.30, c: 0.74 },
    { x: 0.70, y: 0.20, w: 0.18, h: 0.24, c: 0.33 },
    { x: 0.16, y: 0.54, w: 0.20, h: 0.26, c: 0.21 },
    { x: 0.46, y: 0.50, w: 0.24, h: 0.32, c: 0.58 },
    { x: 0.74, y: 0.56, w: 0.16, h: 0.24, c: 0.09 },
    { x: 0.30, y: 0.30, w: 0.16, h: 0.20, c: 0.05 },
    { x: 0.58, y: 0.28, w: 0.14, h: 0.18, c: 0.15 },
  ];

  function initSensitivity() {
    $$("[data-ac-sensitivity]").forEach(function (root) {
      var canvas = $("[data-ac-sens-canvas]", root);
      var range = $("[data-ac-sens-range]", root);
      var valEl = $("[data-ac-sens-value]", root);
      var countEl = $("[data-ac-sens-count]", root);
      var noteEl = $("[data-ac-sens-note]", root);
      if (!canvas) return;
      var ctx = canvas.getContext("2d");
      var W = canvas.width || 560, H = canvas.height || 360;
      canvas.width = W; canvas.height = H;
      var ink = accent(root);

      function render(threshold) {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = "#0f1722";
        ctx.fillRect(0, 0, W, H);
        // faint grid so it reads as a detector view, not a photo
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.lineWidth = 1;
        for (var gx = 0; gx <= W; gx += 28) {
          ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
        }
        for (var gy = 0; gy <= H; gy += 28) {
          ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
        }
        var kept = 0;
        CANDIDATES.forEach(function (b) {
          var active = b.c >= threshold;
          if (active) kept++;
          var x = b.x * W, y = b.y * H, w = b.w * W, h = b.h * H;
          ctx.save();
          ctx.fillStyle = active ? hexA(ink, 0.14) : "rgba(148,163,184,0.08)";
          ctx.strokeStyle = active ? ink : "rgba(148,163,184,0.34)";
          ctx.lineWidth = active ? 2.5 : 1.4;
          ctx.setLineDash(active ? [6, 4] : [3, 5]);
          roundRect(ctx, x, y, w, h, 6);
          ctx.fill();
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = active ? ink : "rgba(203,213,225,0.7)";
          ctx.font = "600 11px ui-monospace, monospace";
          ctx.textBaseline = "top";
          ctx.fillText(b.c.toFixed(2), x + 5, y + 5);
          ctx.restore();
        });
        ctx.fillStyle = "rgba(230,238,247,0.7)";
        ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
        ctx.textBaseline = "bottom";
        ctx.fillText(isEnglish() ? "Candidate regions" : "후보 영역 (감지 단계)", 12, H - 12);
        if (countEl) countEl.textContent = String(kept);
        return kept;
      }

      function update() {
        var v = range ? Number(range.value) / 100 : 0.2;
        if (valEl) valEl.textContent = v.toFixed(2);
        var kept = render(v);
        if (noteEl) {
          noteEl.textContent = isEnglish()
            ? (v <= 0.1
              ? "Lower values are more sensitive: " + kept + " candidates pass the threshold."
              : v >= 0.4
                ? "Higher values keep only confident candidates: " + kept + " remain."
                : "Only the candidate count changes at the detection stage (" + kept + " now).")
            : (v <= 0.1
              ? "낮은 값일수록 더 민감합니다: 후보 " + kept + "개가 임계값을 통과합니다."
              : v >= 0.4
                ? "높은 값일수록 확실한 후보만 남깁니다: 후보 " + kept + "개."
                : "감지 단계의 후보 수만 달라집니다 (현재 " + kept + "개).");
        }
      }

      if (range) {
        range.addEventListener("input", update);
        range.addEventListener("change", update);
      }
      $$("[data-ac-sens]", root).forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (range) range.value = String(Math.round(Number(btn.getAttribute("data-ac-sens")) * 100));
          update();
          $$("[data-ac-sens]", root).forEach(function (b) {
            b.setAttribute("aria-pressed", b === btn ? "true" : "false");
            b.classList.toggle("is-active", b === btn);
          });
        });
      });
      update();
    });
  }

  function hexA(hex, a) {
    var h = hex.replace("#", "").trim();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return "rgba(45,212,191," + a + ")";
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  /* ----------------------------------------------- before / after slider */
  function initCompare() {
    $$("[data-ac-compare]").forEach(function (root) {
      var mode = root.getAttribute("data-ac-compare") || "demo";
      var handle = $("[data-ac-compare-handle]", root);
      var afterLayer = $("[data-ac-compare-after]", root);
      if (!handle || !afterLayer) return;

      if (mode === "demo") {
        var cb = $("[data-ac-compare-canvas='before']", root);
        var ca = $("[data-ac-compare-canvas='after']", root);
        if (cb && ca) {
          [cb, ca].forEach(function (c) {
            var W = c.width || 720, H = c.height || 460;
            c.width = W; c.height = H;
          });
          var bx = cb.getContext("2d"), ax = ca.getContext("2d");
          drawScene(bx, cb.width, cb.height);
          drawScene(ax, ca.width, ca.height);
          paintProtection(ax, ca.width, ca.height, "mosaic", accent(root));
        }
      }

      var pos = 50;
      function apply(p) {
        pos = clamp(p, 0, 100);
        // clip-path keeps both layers at full container width (no squish),
        // so the two canvases/images stay pixel-aligned while we wipe.
        root.style.setProperty("--ac-pos", pos + "%");
        handle.style.left = pos + "%";
        handle.setAttribute("aria-valuenow", String(Math.round(pos)));
        handle.setAttribute("aria-valuetext", isEnglish()
          ? "Left original " + Math.round(pos) + "%, right protected " + Math.round(100 - pos) + "%"
          : "왼쪽 원본 " + Math.round(pos) + "%, 오른쪽 보호 적용 " + Math.round(100 - pos) + "%");
      }
      function fromClientX(clientX) {
        var rect = root.getBoundingClientRect();
        return ((clientX - rect.left) / rect.width) * 100;
      }

      var dragging = false;
      function down(e) {
        dragging = true;
        root.classList.add("is-dragging");
        if (e.clientX != null) apply(fromClientX(e.clientX));
        if (root.setPointerCapture && e.pointerId != null) {
          try { root.setPointerCapture(e.pointerId); } catch (err) {}
        }
        e.preventDefault();
      }
      function move(e) {
        if (!dragging) return;
        var cx = e.clientX != null ? e.clientX
          : (e.touches && e.touches[0] ? e.touches[0].clientX : null);
        if (cx != null) apply(fromClientX(cx));
      }
      function up() { dragging = false; root.classList.remove("is-dragging"); }

      // Pointer events cover mouse + touch + pen in one path.
      if (window.PointerEvent) {
        root.addEventListener("pointerdown", down);
        root.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        root.addEventListener("pointercancel", up);
      } else {
        root.addEventListener("mousedown", down);
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
        root.addEventListener("touchstart", down, { passive: false });
        root.addEventListener("touchmove", move, { passive: false });
        window.addEventListener("touchend", up);
      }

      // Keyboard: the handle is a real slider.
      handle.setAttribute("role", "slider");
      handle.setAttribute("tabindex", "0");
      handle.setAttribute("aria-valuemin", "0");
      handle.setAttribute("aria-valuemax", "100");
      handle.setAttribute("aria-label", isEnglish()
        ? "Comparison slider: original on the left, protected result on the right"
        : "왼쪽 원본과 오른쪽 보호 적용 비교 슬라이더");
      handle.addEventListener("keydown", function (e) {
        var step = e.shiftKey ? 10 : 2;
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") { apply(pos - step); e.preventDefault(); }
        else if (e.key === "ArrowRight" || e.key === "ArrowUp") { apply(pos + step); e.preventDefault(); }
        else if (e.key === "Home") { apply(0); e.preventDefault(); }
        else if (e.key === "End") { apply(100); e.preventDefault(); }
        else if (e.key === "PageDown") { apply(pos - 10); e.preventDefault(); }
        else if (e.key === "PageUp") { apply(pos + 10); e.preventDefault(); }
      });

      apply(50);
    });
  }

  /* ---------------------------------------------------- model-load toggle */
  function initModelLoad() {
    $$("[data-ac-modelload]").forEach(function (root) {
      var img = $("[data-ac-modelload-img]", root);
      var cap = $("[data-ac-modelload-caption]", root);
      var status = $("[data-ac-modelload-status]", root);
      var btns = $$("[data-ac-mode]", root);
      function set(btn) {
        if (img && btn.getAttribute("data-src")) img.src = btn.getAttribute("data-src");
        if (img && btn.getAttribute("data-alt")) img.alt = btn.getAttribute("data-alt");
        if (cap && btn.getAttribute("data-caption")) cap.textContent = btn.getAttribute("data-caption");
        if (status && btn.getAttribute("data-status")) {
          status.textContent = btn.getAttribute("data-status");
          status.setAttribute("data-state", btn.getAttribute("data-ac-mode"));
        }
        btns.forEach(function (b) {
          var on = b === btn;
          b.setAttribute("aria-pressed", on ? "true" : "false");
          b.classList.toggle("is-active", on);
        });
      }
      btns.forEach(function (b) { b.addEventListener("click", function () { set(b); }); });
      var start = btns.filter(function (b) { return b.getAttribute("data-ac-mode") === "before"; })[0] || btns[0];
      if (start) set(start);
    });
  }

  /* -------------------------------------------------------- mini workflow */
  function initWorkflow() {
    $$("[data-ac-workflow]").forEach(function (root) {
      var img = $("[data-ac-workflow-img]", root);
      var cap = $("[data-ac-workflow-caption]", root);
      var callouts = $("[data-ac-workflow-callouts]", root);
      var steps = $$("[data-ac-step]", root);
      if (!steps.length) return;
      var timer = null;

      function renderCallouts(step) {
        if (!callouts) return;
        callouts.textContent = "";
        var raw = step.getAttribute("data-callouts") || "";
        raw.split("|").forEach(function (t) {
          t = t.trim();
          if (!t) return;
          var li = document.createElement("li");
          li.textContent = t;
          callouts.appendChild(li);
        });
      }

      function set(step, userInitiated) {
        if (img && step.getAttribute("data-src")) img.src = step.getAttribute("data-src");
        if (img && step.getAttribute("data-alt")) img.alt = step.getAttribute("data-alt");
        if (cap && step.getAttribute("data-caption")) cap.textContent = step.getAttribute("data-caption");
        renderCallouts(step);
        steps.forEach(function (s) {
          var on = s === step;
          s.setAttribute("aria-selected", on ? "true" : "false");
          s.classList.toggle("is-active", on);
        });
        if (userInitiated) stop();
      }
      function advance() {
        var idx = steps.findIndex(function (s) { return s.classList.contains("is-active"); });
        set(steps[(idx + 1) % steps.length], false);
      }
      function start() {
        if (reduceMotion()) return;
        if (timer || steps.length < 2) return;
        timer = window.setInterval(advance, 3200);
      }
      function stop() { if (timer) { clearInterval(timer); timer = null; } }

      steps.forEach(function (s) {
        s.addEventListener("click", function () { set(s, true); });
        s.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { set(s, true); e.preventDefault(); }
        });
      });
      set(steps[0], false);
      // Auto-advance only when the section is on screen; pause otherwise.
      if (reduceMotion()) {
        stop();
      } else if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (entries) {
          entries.forEach(function (en) { en.isIntersecting ? start() : stop(); });
        }, { threshold: 0.4 }).observe(root);
      } else {
        start();
      }
      root.addEventListener("mouseenter", stop);
    });
  }

  /* ------------------------------------------------------------- nav + fx */
  function initNav() {
    $$("[data-ac-nav-toggle]").forEach(function (btn) {
      var target = document.getElementById(btn.getAttribute("aria-controls")) ||
        $("[data-ac-nav]");
      btn.addEventListener("click", function () {
        var open = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", open ? "false" : "true");
        if (target) target.classList.toggle("is-open", !open);
      });
    });
    $$('a[href^="#"]').forEach(function (a) {
      a.addEventListener("click", function (e) {
        var id = a.getAttribute("href").slice(1);
        if (!id) return;
        var t = document.getElementById(id);
        if (!t) return;
        e.preventDefault();
        t.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
        // close mobile nav after jump
        $$("[data-ac-nav]").forEach(function (n) { n.classList.remove("is-open"); });
        $$("[data-ac-nav-toggle]").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
      });
    });
  }

  function initReveal() {
    var els = $$("[data-ac-reveal]");
    if (!els.length) return;
    if (!("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("is-visible");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------- click-to-enlarge box */
  // Any screenshot inside .ac-shot becomes click-to-enlarge. Pure overlay,
  // no backend, works on file://. Closes on backdrop click, the close button,
  // or Escape.
  function initLightbox() {
    var shots = $$(".ac-shot, .doc-shot");
    if (!shots.length) return;

    var box = document.createElement("div");
    box.className = "ac-lightbox";
    box.setAttribute("hidden", "");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", isEnglish() ? "Enlarged image" : "이미지 크게 보기");

    var big = document.createElement("img");
    big.className = "ac-lightbox__img";
    big.alt = "";
    var cap = document.createElement("p");
    cap.className = "ac-lightbox__cap";
    var close = document.createElement("button");
    close.type = "button";
    close.className = "ac-lightbox__close";
    close.setAttribute("aria-label", isEnglish() ? "Close" : "닫기");
    close.innerHTML = "&times;";

    box.appendChild(big);
    box.appendChild(cap);
    box.appendChild(close);
    document.body.appendChild(box);

    var lastFocus = null;
    function open(src, alt) {
      if (!src) return;
      big.src = src;
      big.alt = alt || "";
      cap.textContent = alt || "";
      lastFocus = document.activeElement;
      box.removeAttribute("hidden");
      document.documentElement.style.overflow = "hidden";
      close.focus();
    }
    function hide() {
      box.setAttribute("hidden", "");
      big.removeAttribute("src");
      document.documentElement.style.overflow = "";
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    shots.forEach(function (shot) {
      var im = $("img", shot);
      if (!im) return;
      if (!shot.hasAttribute("role")) shot.setAttribute("role", "button");
      if (!shot.hasAttribute("tabindex")) shot.setAttribute("tabindex", "0");
      function trigger() { open(im.currentSrc || im.src, im.alt); }
      shot.addEventListener("click", trigger);
      shot.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); trigger(); }
      });
    });
    close.addEventListener("click", hide);
    box.addEventListener("click", function (e) { if (e.target === box) hide(); });
    big.addEventListener("click", function (e) { e.stopPropagation(); });
    document.addEventListener("keydown", function (e) {
      if (!box.hasAttribute("hidden") && (e.key === "Escape" || e.key === "Esc")) hide();
    });
  }

  /* --------------------------------------------------------------- boot */
  function boot() {
    loadSiteData().then(bindData);
    initStyleDemos();
    initSensitivity();
    initCompare();
    initModelLoad();
    initWorkflow();
    initNav();
    initReveal();
    initLightbox();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
