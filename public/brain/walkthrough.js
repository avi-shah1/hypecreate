/* Brain walkthrough: a video in a phone frame next to a holographic brain, phase by phase.
 *
 * Drop a vertical video in, then play through the five phases a short video takes in the viewer's head:
 * slowly (6 seconds per phase) or as a fast timeline where a click freezes a moment and shows its whole cascade.
 * Each active region glows in its own color. Explanations and studies can be hidden, the video removed.
 *
 * Strengths come from measurable video features (analysis.js), not from a brain scan of this video.
 * Region locations come from measured group maps (maps.bin) and the optional layers from our own encoding model
 * trained on the Emo-FilM fMRI dataset (layers.bin).
 *
 *   PPDurchlauf.start(container, brainData, opt)
 *     opt.karten = PPGehirn.karten(...) result   optional: measured brain maps instead of the textbook atlas
 *     opt.ebenen = PPGehirn.ebenen(...) result   optional: viewer synchrony, model accuracy, emotions
 * Needs: brain.js, analysis.js, phases.js
 */
(function () {
  "use strict";
  var SCHRITT_MS = 6000; // at least 5 seconds per step

  var CSS = [
    ".hd{--hd-bg:#040b19;--hd-bg2:#071429;--hd-ln:rgba(95,212,255,.2);--hd-fg:#dcefff;--hd-fg2:#8fb3d3;--hd-cy:#5fd4ff;--hd-ok:#3ddc97;--hd-warn:#ffb347;",
    "color:var(--hd-fg);background:var(--hd-bg);font:15px/1.55 'IBM Plex Sans',system-ui,sans-serif;display:grid;gap:14px;padding:16px;border:1px solid var(--hd-ln)}",
    ".hd *{box-sizing:border-box}",
    ".hd [hidden]{display:none!important}",
    ".hd a{color:var(--hd-cy)}",
    ".hd-buehne{display:grid;grid-template-columns:minmax(0,300px) minmax(0,1fr);gap:16px;align-items:stretch}",
    ".hd-handy{position:relative;aspect-ratio:9/16;max-height:600px;width:100%;border-radius:30px;border:9px solid #0d1626;background:#000;overflow:hidden;box-shadow:0 0 0 1px var(--hd-ln),0 0 40px rgba(40,120,255,.18)}",
    ".hd-handy video{width:100%;height:100%;object-fit:cover;display:block}",
    ".hd-handy .kerbe{position:absolute;top:6px;left:50%;transform:translateX(-50%);width:34%;height:16px;border-radius:9px;background:#0d1626;z-index:2}",
    ".hd-drop{position:absolute;inset:0;display:grid;place-content:center;gap:10px;text-align:center;padding:18px;color:var(--hd-fg2);font-size:14px;border:2px dashed transparent;z-index:1;background:#000}",
    ".hd-drop.ueber{border-color:var(--hd-cy);background:rgba(95,212,255,.08)}",
    ".hd-drop b{color:var(--hd-fg);font:600 17px 'Chakra Petch',system-ui,sans-serif}",
    ".hd-drop label.datei{justify-self:center;cursor:pointer;border:1px solid var(--hd-ln);padding:7px 12px;color:var(--hd-fg);font:500 12px 'IBM Plex Mono',monospace}",
    ".hd-badge{position:absolute;left:10px;bottom:12px;z-index:2;background:rgba(4,11,25,.8);border:1px solid var(--hd-ln);padding:4px 8px;font:500 11px 'IBM Plex Mono',monospace;color:var(--hd-cy)}",
    ".hd-gehirn{position:relative;min-height:420px;border:1px solid var(--hd-ln);overflow:hidden;background:radial-gradient(ellipse at 50% 46%,rgba(30,110,220,.34),transparent 62%),repeating-linear-gradient(0deg,rgba(80,170,255,.07) 0 1px,transparent 1px 24px),repeating-linear-gradient(90deg,rgba(80,170,255,.07) 0 1px,transparent 1px 24px),var(--hd-bg2)}",
    ".hd-gehirn canvas{position:absolute;inset:0;width:100%;height:100%;cursor:grab;touch-action:none;filter:drop-shadow(0 0 14px rgba(70,170,255,.55)) drop-shadow(0 0 42px rgba(40,120,255,.22))}",
    ".hd-hud{position:absolute;left:14px;top:12px;right:14px;font:11px/1.7 'IBM Plex Mono',monospace;color:var(--hd-fg2);pointer-events:none;white-space:pre-wrap}",
    ".hd-hud b{color:var(--hd-cy);font-weight:500}",
    ".hd-regionen{position:absolute;left:12px;bottom:12px;right:12px;display:flex;flex-wrap:wrap;gap:6px;pointer-events:none}",
    ".hd-regionen span{display:inline-grid;grid-template-columns:auto auto;gap:2px 8px;align-items:center;background:rgba(4,11,25,.82);border:1px solid var(--hd-ln);padding:5px 8px;font:11px/1.3 'IBM Plex Mono',monospace;color:var(--hd-fg)}",
    ".hd-regionen i{width:10px;height:10px;display:inline-block}",
    ".hd-regionen u{grid-column:1/3;display:block;height:3px;background:rgba(95,212,255,.15);text-decoration:none}",
    ".hd-regionen u em{display:block;height:100%}",
    ".hd-phasen{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border:1px solid var(--hd-ln)}",
    ".hd-phasen button{position:relative;text-align:left;background:transparent;color:var(--hd-fg2);border:0;border-right:1px solid var(--hd-ln);padding:10px 12px 12px;cursor:pointer;font:13px/1.35 'IBM Plex Sans',sans-serif;display:grid;gap:2px;min-width:0}",
    ".hd-phasen button:last-child{border-right:0}",
    ".hd-phasen button b{font:600 15px 'Chakra Petch',sans-serif;color:var(--hd-fg)}",
    ".hd-phasen button span{font:11px 'IBM Plex Mono',monospace;color:var(--hd-cy)}",
    ".hd-phasen button[aria-current='step']{background:rgba(95,212,255,.12)}",
    ".hd-phasen i{position:absolute;left:0;bottom:0;height:3px;width:0;background:var(--hd-cy)}",
    ".hd-steuer{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
    ".hd-steuer button{background:rgba(4,14,32,.7);color:var(--hd-fg);border:1px solid var(--hd-ln);padding:6px 10px;font:500 12px 'IBM Plex Mono',monospace;cursor:pointer}",
    ".hd-steuer button[aria-pressed='true']{background:rgba(95,212,255,.2);border-color:var(--hd-cy)}",
    ".hd-steuer .rechts{margin-left:auto}",
    ".hd-steuer select{background:rgba(4,14,32,.7);color:var(--hd-fg);border:1px solid var(--hd-ln);padding:6px 8px;font:500 12px 'IBM Plex Mono',monospace;max-width:260px}",
    ".hd-regionen .ebene{display:block;max-width:560px;grid-template-columns:none}",
    ".hd-regionen .ebene b{display:block;font:600 13px 'Chakra Petch',sans-serif;margin-bottom:3px}",
    ".hd-regionen .ebene .lang{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}",
    "@media (max-width:820px){.hd-regionen .ebene .lang{-webkit-line-clamp:2}.hd-regionen .ebene .herkunft{display:none}}",
    ".hd-regionen .ebene .verlauf{display:block;height:6px;margin:5px 0 3px;background:linear-gradient(90deg,#3a0a00,#c62c00,#ff8a00,#ffe25a,#fff)}",
    ".hd-zeitleiste{position:relative;height:96px;border:1px solid var(--hd-ln);background:var(--hd-bg2);cursor:pointer}",
    ".hd-zeitleiste canvas{width:100%;height:100%;display:block}",
    ".hd-legende{display:flex;flex-wrap:wrap;gap:4px 14px;font:11px 'IBM Plex Mono',monospace;color:var(--hd-fg2)}",
    ".hd-legende i{display:inline-block;width:10px;height:3px;margin-right:5px;vertical-align:middle}",
    ".hd-erklaer{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:14px}",
    ".hd-karte{border:1px solid var(--hd-ln);background:rgba(9,27,54,.78);padding:14px 16px;display:grid;gap:8px;align-content:start;min-width:0}",
    ".hd-karte h3{margin:0;font:600 18px 'Chakra Petch',sans-serif}",
    ".hd-karte .kick{font:500 11px 'IBM Plex Mono',monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--hd-cy)}",
    ".hd-karte ul{margin:0;padding-left:18px;display:grid;gap:4px}",
    ".hd-karte li::marker{color:var(--hd-cy)}",
    ".hd-karte .bereiche{font:12px/1.5 'IBM Plex Mono',monospace;color:var(--hd-fg2)}",
    ".hd-studien{display:grid;gap:6px;font-size:13px;color:var(--hd-fg2)}",
    ".hd-studien div b{color:var(--hd-fg);font-weight:600}",
    ".hd-mess{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;font:12px/1.5 'IBM Plex Mono',monospace;color:var(--hd-fg2)}",
    ".hd-mess b{color:var(--hd-fg);font-weight:500}",
    ".hd-kaskade{display:grid;gap:6px}",
    ".hd-kaskade div{display:grid;grid-template-columns:22px 1fr;gap:10px;align-items:start;border-left:3px solid var(--k,#5fd4ff);padding:4px 0 4px 10px}",
    ".hd-kaskade div > span{font:600 14px 'Chakra Petch',sans-serif;color:var(--hd-cy)}",
    ".hd-kaskade div p{margin:0;font-size:14px} .hd-kaskade div p small{display:block;color:var(--hd-fg2);font-size:12px}",
    ".hd-check{display:grid;gap:6px;font-size:14px}",
    ".hd-check div{display:flex;gap:8px;align-items:baseline}",
    ".hd-check em{font-style:normal;font:600 11px 'IBM Plex Mono',monospace;padding:1px 6px;border:1px solid}",
    ".hd-check em.ok{color:var(--hd-ok);border-color:var(--hd-ok)} .hd-check em.mau{color:var(--hd-warn);border-color:var(--hd-warn)} .hd-check em.leer{color:var(--hd-fg2);border-color:var(--hd-ln)}",
    ".hd-hinweis{font-size:12px;color:var(--hd-fg2)}",
    ".hd-fehler{color:var(--hd-warn);font-size:13px}",
    ".hd.ohne-erklaerung .hd-erklaer,.hd.ohne-erklaerung .hd-legende,.hd.ohne-erklaerung .hd-regionen{display:none}",
    ".hd-fortschritt{height:3px;background:var(--hd-ln)} .hd-fortschritt i{display:block;height:100%;width:0;background:var(--hd-cy)}",
    "@media (max-width:820px){.hd-buehne{grid-template-columns:minmax(0,1fr)}.hd-handy{max-width:300px;justify-self:center}.hd-phasen{grid-template-columns:minmax(0,1fr)}.hd-phasen button{border-right:0;border-bottom:1px solid var(--hd-ln)}.hd-erklaer{grid-template-columns:minmax(0,1fr)}.hd-steuer .rechts{margin-left:0}}",
    "@media (prefers-reduced-motion:reduce){.hd-phasen i{transition:none!important}}",
  ].join("");

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function clamp(x) { return Math.max(0, Math.min(1, x)); }
  function f2(x) { return (Math.round(x * 100) / 100).toLocaleString("en-US"); }
  function sek(x) { return (Math.round(x * 10) / 10).toLocaleString("en-US") + " s"; }
  function kurz(s, n) { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  function start(box, gehirnDaten, opt) {
    opt = opt || {};
    if (!document.getElementById("hd-css")) { var st = document.createElement("style"); st.id = "hd-css"; st.textContent = CSS; document.head.appendChild(st); }
    var P = window.PPPhasen, R = gehirnDaten.regionen, idx = {};
    R.gruppen.forEach(function (g, i) { idx[g.key] = i; });
    box.classList.add("hd");
    box.innerHTML =
      '<div class="hd-buehne"><div class="hd-handy"><div class="kerbe"></div><video playsinline preload="auto" crossorigin="anonymous"></video>' +
      '<div class="hd-drop"><b>Drop a video here</b><span class="hd-drop-text">Vertical, up to 3 minutes. The file stays on your device.</span>' +
      '<label class="datei">Choose file<input type="file" accept="video/*" hidden></label>' +
      '</div><div class="hd-badge" hidden></div></div>' +
      '<div class="hd-gehirn"><canvas></canvas><div class="hd-hud"></div><div class="hd-regionen"></div></div></div>' +
      '<div class="hd-fortschritt" hidden><i></i></div>' +
      '<div class="hd-phasen" role="list"></div>' +
      '<div class="hd-steuer"><button type="button" data-modus="schritte" aria-pressed="true">Steps · slow</button>' +
      '<button type="button" data-modus="timeline" aria-pressed="false">Timeline · click a moment</button>' +
      '<button type="button" data-a="zurueck" aria-label="Back">◀</button><button type="button" data-a="pause">Pause</button>' +
      '<button type="button" data-a="weiter" aria-label="Next">▶</button>' +
      '<button type="button" data-a="entfernen" hidden>Remove video</button>' +
      (opt.ebenen ? '<select class="hd-ebene" aria-label="Brain layer"><option value="">Layer: phases (video)</option>' +
        ["Viewers", "Our model", "Emotion"].map(function (gr) {
          var l = opt.ebenen.liste.filter(function (e) { return e.gruppe === gr; });
          return l.length ? '<optgroup label="' + esc(gr === "Emotion" ? "Emotions (measured, 14 films)" : gr) + '">' +
            l.map(function (e) { return '<option value="' + e.index + '">' + esc(e.name) + "</option>"; }).join("") + "</optgroup>" : "";
        }).join("") + "</select>" : "") +
      (opt.karten ? '<button type="button" class="rechts" data-a="karte" aria-pressed="true" title="Measured brain maps from studies, or the textbook atlas">Brain maps: measured</button>' : "") +
      '<button type="button" class="' + (opt.karten ? "" : "rechts") + '" data-a="erklaer" aria-pressed="true">Explanations on</button></div>' +
      '<div class="hd-zeitleiste" hidden title="Click to freeze a moment"><canvas></canvas></div>' +
      '<div class="hd-legende" hidden><span><i style="background:#5fd4ff"></i>Contrast + color</span><span><i style="background:#3ddc97"></i>Motion · line = cut</span>' +
      '<span><i style="background:#ffb347"></i>Loudness · diamond = jump</span><span><i style="background:#e87ba4"></i>Face</span><span><i style="background:#f2fbff"></i>On-screen text</span></div>' +
      '<div class="hd-erklaer"><div class="hd-karte" data-k="phase"></div><div class="hd-karte" data-k="check"></div></div>' +
      '<p class="hd-hinweis">Explainer view: measures image and sound features of the video and shows which brain areas handle those stimuli. No brain scan of this video, no view prediction.</p>' +
      (opt.karten ? '<p class="hd-hinweis hd-quellen">Brain maps: where the areas sit is measured in people or taken from meta-analyses, not from a textbook. ' +
        esc((opt.karten.meta.namensnennung || []).join(" · ")) + '. "Vision (early)" follows the textbook atlas (Destrieux, nilearn).</p>' : "");

    var $ = function (s) { return box.querySelector(s); };
    var video = $("video"), drop = $(".hd-drop"), dropText = $(".hd-drop-text"), badge = $(".hd-badge"), hud = $(".hd-hud"), regBox = $(".hd-regionen");
    var leiste = $(".hd-zeitleiste"), leisteCv = leiste.querySelector("canvas"), fort = $(".hd-fortschritt");
    var phasenBox = $(".hd-phasen"), karte = $('[data-k="phase"]'), checkKarte = $('[data-k="check"]');
    var gehirn = PPGehirn.ansicht($(".hd-gehirn canvas"), gehirnDaten, {});
    gehirn.form(0.3);
    var messung = !!opt.karten;
    if (opt.karten) gehirn.karten(opt.karten);
    var zust = { modus: "schritte", schritt: 0, laeuft: true, daten: null, os: null, timer: null, t0: 0, raf: 0, moment: null, url: null, ebene: null, vid: null, vh: null, vhId: null, vhTimer: 0, vhSek: -1 };

    P.forEach(function (p, i) {
      var b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "listitem");
      b.innerHTML = "<span>" + p.nr + " · " + esc(p.zeit) + "</span><b>" + esc(p.name) + "</b>" + esc(p.kurz) + "<i></i>";
      b.onclick = function () { ebeneAus(); setzeModus("schritte"); geheZu(i); };
      phasenBox.appendChild(b);
    });

    // ---- Messwerte an einem Zeitpunkt ----
    function wertBei(t) {
      var d = zust.daten; if (!d) return null;
      var k = Math.max(0, Math.min(d.t.length - 1, Math.round(t / d.takt)));
      t = d.t[k];
      var g = d.gesichter ? d.gesichter[k] : null;
      return {
        t: t, k: k, kontrast: d.kontrast[k], farbe: d.farbe[k], bewegung: d.bewegung[k], laut: d.ton ? d.laut[k] : null, gesicht: g,
        schnitt: d.schnitte.some(function (s) { return Math.abs(s - t) <= d.takt; }),
        sprung: d.spruenge.some(function (s) { return Math.abs(s - t) <= 0.3; }),
        sehen: Math.max(0.2, 0.5 * clamp((d.kontrast[k] - 0.12) / 0.45) + 0.5 * clamp(d.farbe[k] / 0.6)),
        bewegung_s: Math.max(0.1, clamp(d.bewegung[k] / 0.12)),
        hoeren: d.ton ? Math.max(0.1, clamp((d.laut[k] + 45) / 40)) : 0.1,
        gesichter: g ? (g.n ? 0.55 + clamp(g.groesse * 4) * 0.45 : 0.12) : null,
      };
    }
    function bildtextBei(t) {
      var os = zust.os; if (!os || !os.bildtext || !os.bildtext.length) return null;
      var akt = null; os.bildtext.forEach(function (s) { if (s.sekunde <= t + 0.01) akt = s; });
      return akt;
    }

    // Staerke je Gruppe fuer eine Phase (Schritt) oder fuer einen Moment (Timeline: Phasen 1-3).
    // gemessen: true = Messwert, false = erklaerend gesetzt (wird in der Legende so beschriftet)
    function staerken(phasen, m) {
      var s = {};
      phasen.forEach(function (pi) {
        P[pi].gruppen.forEach(function (k) {
          var w = 0.7, gem = false;
          if (m) {
            if (k === "sehen") { w = m.sehen; gem = true; }
            else if (k === "bewegung") { w = m.bewegung_s; gem = true; }
            else if (k === "hoeren") { w = m.hoeren; gem = !!zust.daten.ton; }
            else if ((k === "gesichter" || k === "menschen") && m.gesichter != null) { w = k === "menschen" ? m.gesichter * 0.85 : m.gesichter; gem = true; }
            else if (k === "sprache" && zust.os && zust.os.bildtext) { w = bildtextBei(m.t) ? 0.8 : 0.2; gem = true; }
            else if (phasen.length > 1) w = 0.3;
          }
          if (!s[k] || s[k].w < w) s[k] = { w: w, gemessen: gem };
        });
      });
      return s;
    }
    // Woher die Lage des Bereichs stammt: gemessene Karte (Personenzahl), Metaanalyse oder Lehrbuch-Atlas.
    function kartenHerkunft(k) {
      var m = opt.karten && opt.karten.meta.gruppen[k];
      if (!messung || !m) return "Atlas";
      return /^Mess|^Measured/.test(m.art) ? "map " + m.umfang : "map meta-analysis";
    }
    var letzteStaerken = null;
    function zeigeGehirn(s) {
      letzteStaerken = s;
      if (zust.ebene != null) return; // eine gewaehlte Ebene bleibt stehen, bis man zurueck auf "Phasen" stellt
      var arr = new Float32Array(R.gruppen.length);
      Object.keys(s).forEach(function (k) { arr[idx[k]] = s[k].w; });
      gehirn.staerken(arr);
      regBox.innerHTML = Object.keys(s).map(function (k) {
        var g = R.gruppen[idx[k]], w = s[k].w;
        return '<span><i style="background:' + g.farbe + '"></i>' + esc(g.name) + '<u><em style="width:' + Math.round(w * 100) + "%;background:" + g.farbe + '"></em></u>' +
          '<small style="grid-column:1/3;color:#8fb3d3">' + (s[k].gemessen ? "video " + Math.round(w * 100) + "%" : "illustrative") + " · " + kartenHerkunft(k) + "</small></span>";
      }).join("");
    }

    // ---- Karten ----
    function studienHtml(p) {
      return '<span class="kick">What research shows</span><div class="hd-studien">' + (p.studien || []).map(function (s) {
        return "<div><b>" + esc(s.wer) + ":</b> " + esc(s.was) + ' <a href="' + esc(s.url) + '" target="_blank" rel="noopener">Source</a></div>';
      }).join("") + "</div>";
    }
    function messHtml(m) {
      if (!m) return "";
      return '<div class="hd-mess"><span>Moment</span><b>' + sek(m.t) + (m.schnitt ? " · cut" : "") + (m.sprung ? " · loudness jump" : "") + "</b>" +
        "<span>Contrast</span><b>" + f2(m.kontrast) + "</b><span>Colorfulness</span><b>" + f2(m.farbe) + "</b>" +
        "<span>Motion</span><b>" + f2(m.bewegung * 10) + "</b>" +
        "<span>Loudness</span><b>" + (m.laut == null ? "no audio read" : Math.round(m.laut) + " dB") + "</b>" +
        "<span>Face</span><b>" + (m.gesicht == null ? "not measured (browser)" : m.gesicht.n ? m.gesicht.n + " · size " + Math.round(m.gesicht.groesse * 100) + " %" : "none") + "</b></div>";
    }
    function personasHtml() { return ""; }
    function osHtml() { return ""; }
    function zeigePhase(i, m) {
      var p = P[i];
      Array.prototype.forEach.call(phasenBox.children, function (b, j) { b.setAttribute("aria-current", j === i ? "step" : "false"); b.querySelector("i").style.width = "0"; });
      karte.innerHTML = '<span class="kick">Phase ' + p.nr + " · " + esc(p.zeit) + (p.gestaltbar ? " · designable" : " · not measurable") + "</span><h3>" + esc(p.name) + "</h3>" +
        '<div class="bereiche">' + esc(p.bereiche || "") + "</div><p>" + esc(p.erklaerung) + "</p>" +
        (p.key === "bewerten" ? personasHtml() : messHtml(m) + osHtml(p, m ? m.t : null)) +
        studienHtml(p) + '<span class="kick">Levers</span><ul>' + p.hebel.map(function (h) { return "<li>" + esc(h) + "</li>"; }).join("") + "</ul>";
      hud.innerHTML = "PHASE <b>" + p.nr + " " + esc(p.name.toUpperCase()) + "</b> · " + esc(p.zeit) + (m ? " · MOMENT <b>" + sek(m.t) + "</b>" : "");
      badge.hidden = !zust.daten; if (m) badge.textContent = "Phase " + p.nr + " · " + sek(m.t);
      gehirn.blick(p.blick);
    }
    function zeigeKaskade(m) {
      // Ein Moment loest die ganze Kette aus: 1-3 reagieren auf das, was JETZT zu sehen und zu hoeren ist.
      var d = zust.daten, b = bildtextBei(m.t), naechste = d.schnitte.filter(function (s) { return s > m.t + d.takt; })[0];
      // Die Bildbeschreibung gilt fuers Titelbild - nach dem ersten Schnitt zeigt das Video etwas anderes.
      var erstSchnitt = d.schnitte.filter(function (s) { return s > 0.2; })[0], vorSchnitt = erstSchnitt == null || m.t < erstSchnitt - d.takt / 2;
      var bildZeile = m.gesicht != null ? (m.gesicht.n ? m.gesicht.n + " face(s) in frame, size " + Math.round(m.gesicht.groesse * 100) + " %" : "no face in frame")
        : zust.os && zust.os.bild ? (vorSchnitt ? "Cover frame: " + kurz(zust.os.bild, 140) : "new image after the cut")
        : "faces not measurable in this browser";
      var farbe = function (k) { return R.gruppen[idx[k]].farbe; };
      var zeilen = [
        ["1", farbe("sehen"), "Arrive", (m.schnitt ? "Cut: everything is new. " : "") + (m.sprung ? "Loudness jump. " : "") + "Contrast " + f2(m.kontrast) + ", color " + f2(m.farbe) + ", motion " + f2(m.bewegung * 10), "visual cortex, motion area, auditory cortex"],
        ["2", farbe("gesichter"), "Recognize", bildZeile, "face, object and place areas"],
        ["3", farbe("sprache"), "Understand", "on-screen text and speech are not read in the browser", "language network, STS"],
        ["4", farbe("salienz"), "Evaluate", "draws on the last 1-3 s · no video feature measures this", "insula, reward, default mode network"],
        ["5", farbe("selbst"), "Remember", m.schnitt ? "event boundary right here: put the brand here" : naechste != null ? "next event boundary at " + sek(naechste) : "no further event boundary", "hippocampus"],
      ];
      karte.innerHTML = '<span class="kick">Moment ' + sek(m.t) + " · frozen</span><h3>What happens in the viewer's head at this moment</h3>" +
        '<div class="hd-kaskade">' + zeilen.map(function (z) {
          return '<div style="--k:' + z[1] + '"><span>' + z[0] + "</span><p><b>" + z[2] + "</b> · " + esc(z[3]) + "<small>" + z[4] + "</small></p></div>";
        }).join("") + "</div>" + messHtml(m) + '<p class="hd-hinweis">Phases 1 to 3 glow by the measurements of this moment. Click a phase above for the explanation and studies.</p>';
    }
    function hookCheck() {
      var d = zust.daten;
      if (!d) { checkKarte.innerHTML = '<span class="kick">Hook check · first 3 seconds</span><h3>Waiting for a video</h3><p>Drop a file into the phone. This card then shows what happens in the first seconds.</p>'; return; }
      var erstSchnitt = d.schnitte.filter(function (s) { return s > 0.2; })[0], erstSprung = d.spruenge[0];
      var start = 0.5 * clamp((d.kontrast[0] - 0.12) / 0.45) + 0.5 * clamp(d.farbe[0] / 0.6);
      var bew1 = Math.max.apply(null, d.bewegung.slice(1, Math.min(d.bewegung.length, 5)).concat([0]));
      var ges = d.gesichter ? d.gesichter.slice(0, Math.min(d.gesichter.length, 9)).some(function (g) { return g && g.n; }) : null;
      var bt = zust.os && zust.os.bildtext ? zust.os.bildtext.filter(function (s) { return s.sekunde <= 2; })[0] : undefined;
      function zeile(ok, text) { return "<div><em class=\"" + (ok === null ? "leer" : ok ? "ok" : "mau") + "\">" + (ok === null ? "-" : ok ? "yes" : "no") + "</em><span>" + text + "</span></div>"; }
      checkKarte.innerHTML = '<span class="kick">Hook check · first 3 seconds</span><h3>What happens in the first second</h3><div class="hd-check">' +
        zeile(start >= 0.45, "First frame with strong contrast or color (" + f2(start) + ")") +
        zeile(bew1 >= 0.05 || (erstSchnitt != null && erstSchnitt <= 1), "Motion or a cut in the first second" + (erstSchnitt != null ? " (first cut at " + sek(erstSchnitt) + ")" : "")) +
        zeile(d.ton ? erstSprung != null && erstSprung <= 1.5 : null, d.ton ? (erstSprung != null ? "Loudness jump at " + sek(erstSprung) : "No loudness jump found") : "Audio not read") +
        zeile(ges, ges === null ? "Face: not measurable in this browser" : "Face in the first 2 seconds") +
        zeile(erstSchnitt != null && erstSchnitt <= 3, erstSchnitt != null ? "First event boundary at " + sek(erstSchnitt) + " · put the brand here" : "No event boundary in the first 3 seconds") +
        "</div><p class=\"hd-hinweis\">Facts about the video, not a score.</p>";
    }

    function insightLeeren() {}

    // ---- Schritte (langsam) ----
    function phasenMoment(i) {
      var d = zust.daten, p = P[i]; if (!d) return null;
      if (p.key === "behalten") { var s = d.schnitte.filter(function (x) { return x > 0.2; })[0]; return s != null ? s : Math.min(1.5, d.dauer - 0.1); }
      return Math.min(p.moment, d.dauer - 0.05);
    }
    function geheZu(i) {
      zust.schritt = (i + P.length) % P.length;
      var t = phasenMoment(zust.schritt), m = null;
      if (t != null) { video.pause(); video.currentTime = t; m = wertBei(t); }
      zeigePhase(zust.schritt, m);
      zeigeGehirn(staerken([zust.schritt], P[zust.schritt].key === "bewerten" ? null : m));
      zeichneLeiste(t);
      zust.t0 = performance.now();
      planeWeiter();
    }
    function planeWeiter() {
      clearTimeout(zust.timer); cancelAnimationFrame(zust.raf);
      if (zust.modus !== "schritte" || !zust.laeuft) return;
      var balken = phasenBox.children[zust.schritt].querySelector("i");
      (function fuellen() {
        var a = (performance.now() - zust.t0) / SCHRITT_MS; balken.style.width = Math.min(100, a * 100) + "%";
        if (a < 1) zust.raf = requestAnimationFrame(fuellen);
      })();
      zust.timer = setTimeout(function () {
        if (zust.schritt === P.length - 1) { zust.laeuft = false; pauseKnopf(); return; } // am Ende stehen bleiben
        geheZu(zust.schritt + 1);
      }, SCHRITT_MS);
    }
    function pauseKnopf() { $('[data-a="pause"]').textContent = zust.modus === "timeline" ? (video.paused ? "Play" : "Pause") : zust.laeuft ? "Pause" : "Play"; }

    // ---- Timeline (schnell) und festgehaltene Momente ----
    function momentZeigen(t, festhalten) {
      var m = wertBei(t); if (!m) return;
      zeigeGehirn(staerken([0, 1, 2], m));
      var pi = m.t < 0.15 ? 0 : m.t < 0.3 ? 1 : m.t < 1 ? 2 : m.t < 3 ? 3 : 4;
      Array.prototype.forEach.call(phasenBox.children, function (b, j) { b.setAttribute("aria-current", j === pi ? "step" : "false"); });
      badge.hidden = false; badge.textContent = sek(m.t) + (festhalten ? " · frozen" : "");
      hud.innerHTML = (festhalten ? "MOMENT" : "TIMELINE") + " <b>" + sek(m.t) + "</b>" + (m.schnitt ? " · <b>SCHNITT</b>" : "") + (m.sprung ? " · <b>SPRUNG</b>" : "");
      if (festhalten || video.paused) zeigeKaskade(m);
      if (zust.ebene === "vh") vhFrame();
      zeichneLeiste(m.t);
    }
    function zeitlinieTick() {
      if (zust.modus !== "timeline") return;
      momentZeigen(video.currentTime, false);
      if (!video.paused) zust.raf = requestAnimationFrame(zeitlinieTick);
    }
    function zeichneLeiste(t) {
      var d = zust.daten; if (!d) return;
      var dpr = window.devicePixelRatio || 1, w = leisteCv.clientWidth, h = leisteCv.clientHeight;
      leisteCv.width = w * dpr; leisteCv.height = h * dpr;
      var c = leisteCv.getContext("2d"); c.scale(dpr, dpr); c.clearRect(0, 0, w, h);
      var x = function (s) { return 8 + (w - 16) * s / d.dauer; }, y = function (v) { return h - 10 - (h - 22) * clamp(v); };
      function linie(werte, farbe) { c.beginPath(); werte.forEach(function (v, k) { var px = x(d.t[k]), py = y(v); k ? c.lineTo(px, py) : c.moveTo(px, py); }); c.strokeStyle = farbe; c.lineWidth = 1.6; c.stroke(); }
      c.strokeStyle = "rgba(95,212,255,.12)"; c.lineWidth = 1;
      for (var s = 0; s <= d.dauer; s += 1) { c.beginPath(); c.moveTo(x(s), 6); c.lineTo(x(s), h - 6); c.stroke(); }
      if (zust.os && zust.os.bildtext) { c.fillStyle = "rgba(242,251,255,.18)"; zust.os.bildtext.forEach(function (b2, j, a) { var bis = j + 1 < a.length ? a[j + 1].sekunde : d.dauer; c.fillRect(x(b2.sekunde), 2, Math.max(2, x(bis) - x(b2.sekunde) - 2), 4); }); }
      linie(d.t.map(function (_, k) { return 0.5 * clamp((d.kontrast[k] - 0.12) / 0.45) + 0.5 * clamp(d.farbe[k] / 0.6); }), "#5fd4ff");
      linie(d.bewegung.map(function (v) { return clamp(v / 0.12); }), "#3ddc97");
      if (d.ton) linie(d.laut.map(function (v) { return clamp((v + 45) / 40); }), "#ffb347");
      c.fillStyle = "#e87ba4"; if (d.gesichter) d.gesichter.forEach(function (g, k) { if (g && g.n) c.fillRect(x(d.t[k]) - 1.5, h - 7, 3, 3); });
      c.strokeStyle = "rgba(242,251,255,.85)"; d.schnitte.forEach(function (s2) { c.beginPath(); c.moveTo(x(s2), 8); c.lineTo(x(s2), h - 4); c.stroke(); });
      c.fillStyle = "#ffb347"; d.spruenge.forEach(function (s2) { c.save(); c.translate(x(s2), 12); c.rotate(Math.PI / 4); c.fillRect(-3, -3, 6, 6); c.restore(); });
      if (t != null) { c.fillStyle = "#f2fbff"; c.fillRect(x(t) - 1, 0, 2, h); }
      c.fillStyle = "rgba(143,179,211,.9)"; c.font = "10px IBM Plex Mono, monospace"; c.fillText("0 s", 8, h - 1); c.fillText(sek(d.dauer), w - 44, h - 1);
    }
    leiste.addEventListener("click", function (e) {
      var d = zust.daten; if (!d) return;
      var r = leiste.getBoundingClientRect(), t = clamp((e.clientX - r.left - 8) / (r.width - 16)) * d.dauer;
      if (zust.modus !== "timeline") setzeModus("timeline");
      video.pause(); video.currentTime = t;
      video.addEventListener("seeked", function () { momentZeigen(t, true); }, { once: true });
    });

    // ---- Modus und Steuerung ----
    function setzeModus(m) {
      zust.modus = m;
      box.querySelectorAll("[data-modus]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-modus") === m)); });
      clearTimeout(zust.timer); cancelAnimationFrame(zust.raf);
      if (m === "timeline") {
        if (!zust.daten) { setzeModus("schritte"); return; }
        video.controls = true; gehirn.blick("links"); pauseKnopf(); momentZeigen(video.currentTime, true);
      } else { video.controls = false; zust.laeuft = true; pauseKnopf(); geheZu(zust.schritt); }
    }
    box.querySelectorAll("[data-modus]").forEach(function (b) { b.onclick = function () { ebeneAus(); setzeModus(b.getAttribute("data-modus")); }; });
    // ---- Ebenen: Synchronitaet, Modell-Genauigkeit, Emotionen (Gruppenergebnisse aus Emo-FilM) ----
    function ebeneAn(i) {
      var e = opt.ebenen.liste.filter(function (x) { return x.index === i; })[0]; if (!e) return;
      zust.ebene = i; zust.laeuft = false; clearTimeout(zust.timer); cancelAnimationFrame(zust.raf); pauseKnopf();
      gehirn.werte(opt.ebenen.werte(i), { min: 0, max: 1, schwelle: 0.12 });
      gehirn.blick("links");
      hud.innerHTML = "LAYER <b>" + esc(e.name.toUpperCase()) + "</b> · " + esc(e.gruppe);
      regBox.innerHTML = '<span class="ebene" title="' + esc(e.text + " Quelle: " + e.quelle) + '"><b>' + esc(e.name) + '</b><small class="lang">' + esc(e.text) +
        '</small><i class="verlauf"></i><small style="color:#8fb3d3">weak → strong<span class="herkunft"> · ' + esc(e.quelle) + "</span></small></span>";
    }
    function ebeneAus() {
      if (zust.ebene == null) return;
      zust.ebene = null;
      var sel = box.querySelector(".hd-ebene"); if (sel) sel.value = "";
      if (letzteStaerken) zeigeGehirn(letzteStaerken);
    }
    if (opt.ebenen) box.querySelector(".hd-ebene").addEventListener("change", function (e) {
      if (e.target.value === "") { ebeneAus(); geheZu(zust.schritt); } else if (e.target.value === "vh") vhAn(); else if (e.target.value.charAt(0) === "h") hcpAn(Number(e.target.value.slice(1))); else ebeneAn(Number(e.target.value));
    });
    function vhZuruecksetzen() {}
    function vhFrame() {}
    function vhAn() {}
    function hcpAn() {}
    function springe(dt) { video.pause(); var t = Math.max(0, Math.min(video.duration || 0, video.currentTime + dt)); video.currentTime = t; video.addEventListener("seeked", function () { momentZeigen(t, true); }, { once: true }); }
    $('[data-a="weiter"]').onclick = function () { if (zust.modus === "timeline") springe(0.25); else geheZu(zust.schritt + 1); };
    $('[data-a="zurueck"]').onclick = function () { if (zust.modus === "timeline") springe(-0.25); else geheZu(zust.schritt - 1); };
    $('[data-a="pause"]').onclick = function () {
      if (zust.modus === "timeline") { if (video.paused) video.play(); else video.pause(); return; }
      zust.laeuft = !zust.laeuft; pauseKnopf();
      if (zust.laeuft) { if (zust.schritt === P.length - 1) geheZu(0); else { zust.t0 = performance.now(); planeWeiter(); } } else { clearTimeout(zust.timer); cancelAnimationFrame(zust.raf); }
    };
    if (opt.karten) $('[data-a="karte"]').onclick = function (e) {
      messung = !messung; gehirn.messung(messung);
      e.target.setAttribute("aria-pressed", String(messung)); e.target.textContent = messung ? "Brain maps: measured" : "Brain maps: textbook";
      if (letzteStaerken) zeigeGehirn(letzteStaerken);
    };
    $('[data-a="erklaer"]').onclick = function (e) {
      var aus = box.classList.toggle("ohne-erklaerung"); e.target.setAttribute("aria-pressed", String(!aus)); e.target.textContent = aus ? "Explanations off" : "Explanations on";
    };
    $('[data-a="entfernen"]').onclick = function () { entfernen(); };
    video.addEventListener("play", function () { if (zust.modus === "timeline") { pauseKnopf(); zeitlinieTick(); } });
    video.addEventListener("pause", function () { if (zust.modus === "timeline") { pauseKnopf(); momentZeigen(video.currentTime, true); } });

    // ---- Video laden und entfernen ----
    function entfernen() {
      clearTimeout(zust.timer); cancelAnimationFrame(zust.raf);
      video.pause(); if (video.src && video.src.indexOf("blob:") === 0) URL.revokeObjectURL(video.src);
      video.removeAttribute("src"); video.load(); video.controls = false;
      zust.daten = null; zust.os = null; zust.url = null; zust.schritt = 0; zust.modus = "schritte"; zust.laeuft = true;
      box.querySelectorAll("[data-modus]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-modus") === "schritte")); });
      drop.hidden = false; dropText.textContent = "Vertical, up to 3 minutes. The file stays on your device.";
      leiste.hidden = true; $(".hd-legende").hidden = true; $('[data-a="entfernen"]').hidden = true; badge.hidden = true;
      var li = box.querySelector(".hd-link input"); if (li) li.value = "";
      hookCheck(); insightLeeren(); vhZuruecksetzen(); pauseKnopf(); geheZu(0);
    }
    function lade(file, os, url, vid) {
      if (!file || (file.type && !/^video\//.test(file.type))) { dropText.textContent = "That is not a video file."; return; }
      clearTimeout(zust.timer); cancelAnimationFrame(zust.raf);
      zust.os = os || null; zust.url = url || null; zust.vid = vid || null;
      video.src = URL.createObjectURL(file); video.muted = false;
      drop.hidden = true; fort.hidden = false; fort.querySelector("i").style.width = "2%";
      hud.textContent = "Reading video …";
      return PPAnalyse.analysiere(file, function (a, text) { fort.querySelector("i").style.width = Math.round(a * 100) + "%"; hud.textContent = "Measuring image and sound … " + text; })
        .then(function (d) {
          zust.daten = d; fort.hidden = true; leiste.hidden = false; $(".hd-legende").hidden = false; $('[data-a="entfernen"]').hidden = false;
          hookCheck(); insightLeeren(); vhZuruecksetzen(); zust.schritt = 0; setzeModus("schritte");
        })
        .catch(function (e) { fort.hidden = true; drop.hidden = false; dropText.textContent = "Could not read the video: " + e.message; });
    }
    drop.querySelector('input[type="file"]').onchange = function (e) { lade(e.target.files[0]); };
    var buehne = $(".hd-buehne");
    ["dragenter", "dragover"].forEach(function (ev) { buehne.addEventListener(ev, function (e) { e.preventDefault(); drop.hidden = false; drop.classList.add("ueber"); }); });
    ["dragleave", "drop"].forEach(function (ev) { buehne.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("ueber"); if (ev === "dragleave" && zust.daten) drop.hidden = true; }); });
    buehne.addEventListener("drop", function (e) { var f = e.dataTransfer && e.dataTransfer.files[0]; if (f) lade(f); });

    hookCheck(); geheZu(0);
    return { lade: lade, modus: setzeModus, geheZu: geheZu, entfernen: entfernen, moment: function (t) { setzeModus("timeline"); video.currentTime = t; video.addEventListener("seeked", function () { momentZeigen(t, true); }, { once: true }); } };
  }

  window.PPDurchlauf = { start: start };
})();
