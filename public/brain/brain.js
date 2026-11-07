/* Gehirn-Ansicht: fsaverage5-Hirnoberflaeche in WebGL, ohne Fremdbibliothek.
 *
 * Dasselbe Netz, auf dem TRIBE v2 (bzw. unser eigenes Hirnmodell) Werte ausgibt - 20.484 Punkte, links zuerst.
 * Zwei Modi: "gruppen" faerbt die Funktionsgruppen (regionen.json), "werte" legt eine Vorhersage je Punkt als
 * Hitzekarte ueber die Furchen-Schattierung. Drehen per Ziehen, Bereich per Klick/Hover.
 *
 *   PPGehirn.laden(binUrl, jsonUrl) -> Promise<{netz, regionen}>
 *   const a = PPGehirn.ansicht(canvas, daten, {onPunkt(gruppe|null)})
 *   a.blick('links'|'rechts'|'oben'|'unten'|'vorne'|'hinten'|'innen-links'|'innen-rechts')
 *   a.modus('gruppen'|'werte'); a.werte(Float32Array|null, {min, max}); a.hervorheben(gruppenIndex|null)
 */
(function () {
  "use strict";

  function hexRgb(h) { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255]; }

  function parse(buf) {
    var dv = new DataView(buf), magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
    if (magic !== "PPG2") throw new Error("Unknown mesh format");
    var n = dv.getUint32(4, true), nd = dv.getUint32(8, true), o = 12;
    var infl = new Float32Array(buf.slice(o, o + n * 12)); o += n * 12;
    var pial = new Float32Array(buf.slice(o, o + n * 12)); o += n * 12;
    var sulc = new Uint8Array(buf.slice(o, o + n)); o += n;
    var gruppe = new Uint8Array(buf.slice(o, o + n)); o += n;
    var areal = new Uint8Array(buf.slice(o, o + n)); o += n;
    var d32 = new Uint32Array(buf.slice(o, o + nd * 12));
    var idx = new Uint16Array(d32.length); for (var i = 0; i < d32.length; i++) idx[i] = d32[i];
    var netz = { n: n, infl: infl, pial: pial, pos: new Float32Array(n * 3), nor: new Float32Array(n * 3), sulc: sulc, gruppe: gruppe, areal: areal, idx: idx };
    form(netz, 0.35);
    return netz;
  }

  // Ueberblenden zwischen gefaltet (0) und aufgeblaeht (1), Normalen neu fuer die Beleuchtung.
  function form(netz, f) {
    var pos = netz.pos, nor = netz.nor, idx = netz.idx, n = netz.n;
    for (var i = 0; i < n * 3; i++) pos[i] = netz.pial[i] * (1 - f) + netz.infl[i] * f;
    nor.fill(0);
    for (var t = 0; t < idx.length; t += 3) {
      var a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      var ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      var vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (var k = 0; k < 3; k++) { var p = idx[t + k] * 3; nor[p] += nx; nor[p + 1] += ny; nor[p + 2] += nz; }
    }
    for (var j = 0; j < n; j++) { var l = Math.hypot(nor[j * 3], nor[j * 3 + 1], nor[j * 3 + 2]) || 1; nor[j * 3] /= l; nor[j * 3 + 1] /= l; nor[j * 3 + 2] /= l; }
  }

  function laden(binUrl, jsonUrl) {
    return Promise.all([
      fetch(binUrl).then(function (r) { if (!r.ok) throw new Error("Mesh " + r.status); return r.arrayBuffer(); }),
      fetch(jsonUrl).then(function (r) { if (!r.ok) throw new Error("Regions " + r.status); return r.json(); }),
    ]).then(function (x) { return { netz: parse(x[0]), regionen: x[1] }; });
  }

  // Farbskala "fire" wie in der TRIBE-Demo: schwarzrot -> orange -> gelb -> weiss
  function feuer(t) {
    t = Math.max(0, Math.min(1, t));
    return [Math.min(1, t * 2.2), Math.max(0, Math.min(1, (t - 0.35) * 2)), Math.max(0, Math.min(1, (t - 0.75) * 4))];
  }

  // Holo-Stil (Julius, 03.10.2026: leuchtendes blaues Gehirn auf dunklem Grund): Koerper tiefblau, Randschein
  // (Fresnel) cyan, Aktivitaet als Eigenleuchten. c = Farbe je Punkt, Alpha-Kanal e = Eigenleuchten 0..1.
  var VS = "attribute vec3 p;attribute vec3 n;attribute vec4 c;uniform mat4 m;uniform mat4 v;varying vec4 vc;varying vec3 wn;" +
    "void main(){wn=normalize((m*vec4(n,0.)).xyz);vc=c;gl_Position=v*m*vec4(p,1.);}";
  var FS = "precision mediump float;varying vec4 vc;varying vec3 wn;uniform float holo;" +
    "void main(){vec3 N=normalize(wn);float li=0.32+0.68*max(dot(N,normalize(vec3(.3,.45,1.))),0.);" +
    "float rim=pow(1.-abs(N.z),2.2);" +
    "vec3 hell=vc.rgb*li;" +
    "vec3 holoC=vc.rgb*(0.55+0.45*li)+vec3(.25,.75,1.)*rim*0.85+vc.rgb*vc.a*0.9;" +
    "gl_FragColor=vec4(mix(hell,holoC,holo),1.);}";

  function mat4Mul(a, b) { var o = new Float32Array(16); for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) { var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
  function rotX(a) { var c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); }
  function rotY(a) { var c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); }
  function rotZ(a) { var c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }

  // fsaverage: x = rechts, y = vorne, z = oben. Nach der Grunddrehung zeigt Gieren +90 Grad die linke Haelfte
  // von links (Stirn links im Bild), -90 Grad die rechte von rechts. Innenansicht = nur eine Haelfte, von der
  // Mitte aus gesehen. Nachgerechnet am 03.10.2026 ueber die Schwerpunkte von Sehrinde (hinten) und OFC (vorne).
  var BLICKE = {
    "links": [Math.PI / 2, 0], "rechts": [-Math.PI / 2, 0], "vorne": [Math.PI, 0], "hinten": [0, 0],
    "oben": [0, Math.PI / 2], "unten": [0, -Math.PI / 2], "innen-links": [-Math.PI / 2, 0], "innen-rechts": [Math.PI / 2, 0],
  };

  function ansicht(canvas, daten, opt) {
    opt = opt || {};
    var netz = daten.netz, reg = daten.regionen, gl = canvas.getContext("webgl", { antialias: true, preserveDrawingBuffer: false });
    if (!gl) throw new Error("WebGL not available");
    var grp = reg.gruppen.map(function (g) { return hexRgb(g.farbe); });
    function sh(t, s) { var x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; }
    var pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    var bP = gl.createBuffer(), bN = gl.createBuffer(), bC = gl.createBuffer(), bI = gl.createBuffer();
    function geometrie() {
      gl.bindBuffer(gl.ARRAY_BUFFER, bP); gl.bufferData(gl.ARRAY_BUFFER, netz.pos, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, bN); gl.bufferData(gl.ARRAY_BUFFER, netz.nor, gl.DYNAMIC_DRAW);
    }
    geometrie();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bI); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, netz.idx, gl.STATIC_DRAW);
    var farben = new Float32Array(netz.n * 4);
    var holo = opt.stil !== "hell";
    var st = { modus: opt.modus || (holo ? "holo" : "gruppen"), werte: null, skala: null, hl: null, yaw: Math.PI / 2, pitch: 0, haelfte: "beide", zoom: 1, form: 0.35 };

    function faerben() {
      var w = st.werte, sk = st.skala || {};
      var lo = sk.min != null ? sk.min : 0, hi = sk.max != null ? sk.max : 1, schwelle = sk.schwelle != null ? sk.schwelle : 0.15;
      var aktiv = [];
      if (st.gs) for (var ag0 = 0; ag0 < st.gs.length; ag0++) if (st.gs[ag0] > 0.02) aktiv.push(ag0);
      for (var i = 0; i < netz.n; i++) {
        var tief = netz.sulc[i] / 255, r, gg, b, e = 0; // sulc: hoch = Furche (dunkler)
        if (holo) { r = 0.03 + 0.05 * (1 - tief); gg = 0.16 + 0.22 * (1 - tief); b = 0.42 + 0.4 * (1 - tief); }
        else { var g = 0.42 + 0.36 * (1 - tief); r = g; gg = g; b = g; }
        if (st.modus === "staerke" && st.karten && st.messung) {
          // Gemessene Hirnkarten (tribe-lab/hirnkarten): jeder Punkt leuchtet so stark, wie die Karte der Gruppe dort
          // Aktivitaet zeigt - auch ausserhalb der Atlas-Grenzen. Gruppen ohne Karte fallen auf ihre Atlas-Flaeche zurueck.
          var best = 0, bg = -1;
          for (var ai = 0; ai < aktiv.length; ai++) {
            var ga = aktiv[ai], kk = st.karten[ga], kv = kk ? kk[i] / 255 : (netz.gruppe[i] === ga ? 1 : 0), v = st.gs[ga] * kv;
            if (v > best) { best = v; bg = ga; }
          }
          if (best > 0.03) {
            var cm = grp[bg], am = 0.2 + 0.8 * Math.min(1, best);
            r = r * (1 - am) + cm[0] * am; gg = gg * (1 - am) + cm[1] * am; b = b * (1 - am) + cm[2] * am;
            e = holo ? 0.1 + 0.75 * Math.min(1, best) : 0;
          } else if (holo) { r *= 0.55; gg *= 0.55; b *= 0.6; }
        } else if (st.modus === "staerke") {
          // Jede aktive Gruppe in ihrer eigenen Farbe; die Staerke (0..1) bestimmt Deckkraft und Leuchten.
          var gs = netz.gruppe[i], sg = gs === 255 ? 0 : (st.gs[gs] || 0);
          if (sg > 0.02) {
            var cg = grp[gs], ag = 0.35 + 0.65 * Math.min(1, sg);
            r = r * (1 - ag) + cg[0] * ag; gg = gg * (1 - ag) + cg[1] * ag; b = b * (1 - ag) + cg[2] * ag;
            e = holo ? 0.15 + 0.6 * Math.min(1, sg) : 0;
          } else if (holo) { r *= 0.55; gg *= 0.55; b *= 0.6; } // Unbeteiligtes tritt zurueck
        } else if (st.modus === "gruppen" || st.modus === "holo") {
          // holo: Gehirn bleibt blau, nur die hervorgehobene Gruppe leuchtet; gruppen: alle Gruppen farbig
          var gi = netz.gruppe[i];
          if (gi !== 255 && (st.modus === "gruppen" || st.hl === gi)) {
            var col = grp[gi], a = st.hl == null ? (holo ? 0.6 : 0.85) : (st.hl === gi ? 1 : 0.08);
            r = r * (1 - a) + col[0] * a; gg = gg * (1 - a) + col[1] * a; b = b * (1 - a) + col[2] * a;
            if (holo && st.hl === gi) e = 0.3; // leuchten, aber die Gruppenfarbe erkennbar lassen
          }
        } else if (w) {
          var t = (w[i] - lo) / ((hi - lo) || 1);
          if (t > schwelle) {
            // weiche Skala: schwacher und starker Reiz muessen unterscheidbar bleiben (Holo saettigte zu frueh)
            var tt = (t - schwelle) / (1 - schwelle), al = Math.min(1, (t - schwelle) * (holo ? 1.5 : 3));
            // Holo: Aktivitaet leuchtet von Cyan nach Weiss; hell: Feuer-Skala wie in der TRIBE-Demo
            var f = holo ? [0.25 + 0.75 * tt, 0.75 + 0.25 * tt, 1] : feuer(tt);
            r = r * (1 - al) + f[0] * al; gg = gg * (1 - al) + f[1] * al; b = b * (1 - al) + f[2] * al;
            e = holo ? al * (0.4 + 0.6 * tt) : 0;
          }
        }
        farben[i * 4] = r; farben[i * 4 + 1] = gg; farben[i * 4 + 2] = b; farben[i * 4 + 3] = e;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, bC); gl.bufferData(gl.ARRAY_BUFFER, farben, gl.DYNAMIC_DRAW);
    }

    function modellMatrix() {
      // Grund: fsaverage-Achsen auf Bildschirm drehen (z oben -> y oben), dann Gieren/Nicken.
      var basis = rotX(-Math.PI / 2);
      return mat4Mul(rotX(st.pitch), mat4Mul(rotY(st.yaw), basis));
    }
    function zeichnen() {
      var dpr = window.devicePixelRatio || 1, cw = Math.round(canvas.clientWidth * dpr), ch = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.useProgram(pr);
      var ar = canvas.width / canvas.height, s = st.zoom / 125;
      var v = new Float32Array([s / ar, 0, 0, 0, 0, s, 0, 0, 0, 0, -s * 0.5, 0, 0, 0, 0, 1]);
      gl.uniformMatrix4fv(gl.getUniformLocation(pr, "m"), false, modellMatrix());
      gl.uniformMatrix4fv(gl.getUniformLocation(pr, "v"), false, v);
      gl.uniform1f(gl.getUniformLocation(pr, "holo"), holo ? 1 : 0);
      [["p", bP, 3], ["n", bN, 3], ["c", bC, 4]].forEach(function (x) {
        var loc = gl.getAttribLocation(pr, x[0]); gl.bindBuffer(gl.ARRAY_BUFFER, x[1]); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, x[2], gl.FLOAT, false, 0, 0);
      });
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bI);
      var halb = netz.idx.length / 2;
      if (st.haelfte !== "rechts") gl.drawElements(gl.TRIANGLES, halb, gl.UNSIGNED_SHORT, 0);
      if (st.haelfte !== "links") gl.drawElements(gl.TRIANGLES, halb, gl.UNSIGNED_SHORT, halb * 2);
    }
    var geplant = false;
    function neu() { if (geplant) return; geplant = true; requestAnimationFrame(function () { geplant = false; zeichnen(); }); }

    // Punkt unter der Maus: Strahl in Modellkoordinaten, naechstes getroffenes Dreieck (CPU, ~41k Dreiecke).
    function punktUnter(ev) {
      var r = canvas.getBoundingClientRect(), ar = r.width / r.height, s = st.zoom / 125;
      var nx = ((ev.clientX - r.left) / r.width) * 2 - 1, ny = 1 - ((ev.clientY - r.top) / r.height) * 2;
      var sx = nx * ar / s, sy = ny / s; // Bildschirm -> Welt (orthografisch)
      var m = modellMatrix(); // Inverse einer Rotationsmatrix = Transponierte
      function inv(x, y, z) { return [m[0] * x + m[1] * y + m[2] * z, m[4] * x + m[5] * y + m[6] * z, m[8] * x + m[9] * y + m[10] * z]; }
      var o = inv(sx, sy, 0), d = inv(0, 0, -1); // Kamera blickt in -z (Tiefe zur Kamera = +z)
      o = [o[0] - d[0] * 500, o[1] - d[1] * 500, o[2] - d[2] * 500];
      var P = netz.pos, I = netz.idx, best = Infinity, treffer = -1, von = st.haelfte === "rechts" ? I.length / 2 : 0, bis = st.haelfte === "links" ? I.length / 2 : I.length;
      for (var t = von; t < bis; t += 3) {
        var a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
        var e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2], e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
        var px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x, det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-9) continue;
        var f = 1 / det, sx2 = o[0] - P[a], sy2 = o[1] - P[a + 1], sz2 = o[2] - P[a + 2], u = f * (sx2 * px + sy2 * py + sz2 * pz);
        if (u < 0 || u > 1) continue;
        var qx = sy2 * e1z - sz2 * e1y, qy = sz2 * e1x - sx2 * e1z, qz = sx2 * e1y - sy2 * e1x, vv = f * (d[0] * qx + d[1] * qy + d[2] * qz);
        if (vv < 0 || u + vv > 1) continue;
        var tt = f * (e2x * qx + e2y * qy + e2z * qz);
        if (tt > 0 && tt < best) { best = tt; treffer = I[t]; }
      }
      return treffer;
    }

    var zieh = null;
    canvas.addEventListener("pointerdown", function (e) { zieh = { x: e.clientX, y: e.clientY, yaw: st.yaw, pitch: st.pitch, bewegt: false }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", function (e) {
      if (zieh) {
        var dx = e.clientX - zieh.x, dy = e.clientY - zieh.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) zieh.bewegt = true;
        st.yaw = zieh.yaw + dx * 0.01; st.pitch = Math.max(-1.55, Math.min(1.55, zieh.pitch + dy * 0.01)); neu();
      } else if (opt.onPunkt && e.pointerType === "mouse") {
        var p = punktUnter(e); opt.onPunkt(p < 0 ? null : { punkt: p, gruppe: netz.gruppe[p] === 255 ? null : netz.gruppe[p], areal: netz.areal[p], wert: st.werte ? st.werte[p] : null }, false);
      }
    });
    canvas.addEventListener("pointerup", function (e) {
      if (zieh && !zieh.bewegt && opt.onPunkt) { var p = punktUnter(e); opt.onPunkt(p < 0 ? null : { punkt: p, gruppe: netz.gruppe[p] === 255 ? null : netz.gruppe[p], areal: netz.areal[p], wert: st.werte ? st.werte[p] : null }, true); }
      zieh = null;
    });
    canvas.addEventListener("pointerleave", function () { if (!zieh && opt.onPunkt) opt.onPunkt(null, false); });
    // Zoomen nur mit Cmd/Strg - sonst faengt das Gehirn das Scrollen der Seite ab.
    canvas.addEventListener("wheel", function (e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault(); st.zoom = Math.max(0.6, Math.min(3, st.zoom * (e.deltaY < 0 ? 1.1 : 0.9))); neu();
    }, { passive: false });
    if (window.ResizeObserver) new ResizeObserver(neu).observe(canvas);

    faerben(); neu();
    return {
      blick: function (name) { var b = BLICKE[name] || BLICKE.links; st.yaw = b[0]; st.pitch = b[1]; st.haelfte = name === "innen-links" ? "links" : name === "innen-rechts" ? "rechts" : "beide"; neu(); },
      modus: function (m) { st.modus = m; faerben(); neu(); },
      werte: function (w, skala) { st.werte = w; st.skala = skala || null; if (w) st.modus = "werte"; faerben(); neu(); },
      hervorheben: function (g) { if (g === st.hl) return; st.hl = g; faerben(); neu(); },
      // Staerke je Funktionsgruppe (Index wie regionen.json gruppen), Werte 0..1 - jede Gruppe in ihrer Farbe
      staerken: function (arr) { st.gs = arr; st.modus = "staerke"; faerben(); neu(); },
      // Gemessene Karten je Gruppe (Uint8Array 0..255 oder null) aus PPGehirn.karten(); messung(false) = Lehrbuch-Atlas
      karten: function (k) { st.karten = k ? k.werte : null; st.messung = !!k; faerben(); neu(); },
      messung: function (an) { st.messung = !!an && !!st.karten; faerben(); neu(); },
      // 0 = gefaltet (sieht aus wie ein Gehirn), 1 = aufgeblaeht (Furchen sichtbar, so zeigt TRIBE seine Karten)
      form: function (f) { st.form = Math.max(0, Math.min(1, f)); form(netz, st.form); geometrie(); neu(); },
      zeichnen: neu,
      zustand: st,
    };
  }

  // Fuer Seiten, die das Netz eingebettet mitbringen (z. B. die Lernseite): ArrayBuffer + regionen.json-Objekt.
  function ausDaten(buf, regionen) { return { netz: parse(buf), regionen: regionen }; }

  // Gemessene Hirnkarten (karten.bin aus tribe-lab/hirnkarten/11_viewer_export.py): je Gruppe von regionen.json eine Zeile
  // mit 20.484 uint8-Werten. werte[g] ist null, wenn die Gruppe keine Messkarte hat (dann gilt der Atlas).
  function kartenAus(buf, meta, nGruppen, nPunkte) {
    var werte = [];
    for (var g = 0; g < nGruppen; g++) werte.push(null);
    Object.keys(meta.gruppen || {}).forEach(function (k) {
      var m = meta.gruppen[k];
      if (m) werte[m.index] = new Uint8Array(buf, m.index * nPunkte, nPunkte);
    });
    return { werte: werte, meta: meta };
  }
  function karten(binUrl, jsonUrl, daten) {
    return Promise.all([
      fetch(binUrl).then(function (r) { if (!r.ok) throw new Error("Maps " + r.status); return r.arrayBuffer(); }),
      fetch(jsonUrl).then(function (r) { if (!r.ok) throw new Error("Map list " + r.status); return r.json(); }),
    ]).then(function (x) { return kartenAus(x[0], x[1], daten.regionen.gruppen.length, daten.netz.n); });
  }

  // Waehlbare Ebenen (ebenen.bin aus tribe-lab/emofilm/11_viewer_ebenen.py): Synchronitaet, Modell-Genauigkeit, Emotionen.
  // werte(i) liefert die Ebene als Float32Array 0..1 fuer ansicht.werte().
  function ebenen(binUrl, jsonUrl, nPunkte) {
    return Promise.all([
      fetch(binUrl).then(function (r) { if (!r.ok) throw new Error("Layers " + r.status); return r.arrayBuffer(); }),
      fetch(jsonUrl).then(function (r) { if (!r.ok) throw new Error("Layer list " + r.status); return r.json(); }),
    ]).then(function (x) {
      var buf = x[0], liste = x[1].ebenen || [];
      return { liste: liste, werte: function (i) {
        var u = new Uint8Array(buf, i * nPunkte, nPunkte), f = new Float32Array(nPunkte);
        for (var k = 0; k < nPunkte; k++) f[k] = u[k] / 255;
        return f;
      } };
    });
  }

  window.PPGehirn = { laden: laden, ausDaten: ausDaten, ansicht: ansicht, feuer: feuer, karten: karten, kartenAus: kartenAus, ebenen: ebenen };
})();
