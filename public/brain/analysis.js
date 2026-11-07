/* Videoanalyse im Browser fuer den Hirn-Durchlauf - misst, was sich ohne Server messen laesst.
 *
 * Bild (4 Messungen je Sekunde, auf kleinem Bild): Helligkeit, Kontrast, Farbigkeit, Bewegung zum vorigen Bild,
 * Schnitte (Ausreisser der Bewegung). Ton (20 je Sekunde): Lautstaerke in dB, Lautstaerkespruenge.
 * Gesichter nur, wenn der Browser die Shape-Detection-API (FaceDetector) anbietet - sonst null ("nicht gemessen").
 * Das ist eine Messung der Reize, keine Hirnmessung.
 *
 *   PPAnalyse.analysiere(file, fortschritt(0..1, text)) -> Promise<{dauer, takt, t[], hell[], kontrast[], farbe[],
 *     bewegung[], schnitte[], laut[], spruenge[], gesichter[]|null, ton:boolean}>
 */
(function () {
  "use strict";
  var TAKT = 0.25, B = 72, H = 128; // Messraster: 4 Bilder je Sekunde, 72 x 128 Pixel

  function warte(v, ev) { return new Promise(function (ok, nein) { function a() { v.removeEventListener(ev, a); v.removeEventListener("error", b); ok(); } function b() { v.removeEventListener(ev, a); v.removeEventListener("error", b); nein(new Error("Video laesst sich nicht lesen")); } v.addEventListener(ev, a); v.addEventListener("error", b); }); }

  function bildWerte(d, vorher) {
    var n = d.length / 4, s = 0, s2 = 0, rg = 0, rg2 = 0, yb = 0, yb2 = 0, diff = 0, lum = new Float32Array(n);
    for (var i = 0, j = 0; i < d.length; i += 4, j++) {
      var r = d[i], g = d[i + 1], b = d[i + 2], l = 0.299 * r + 0.587 * g + 0.114 * b;
      lum[j] = l; s += l; s2 += l * l;
      var a1 = r - g, a2 = 0.5 * (r + g) - b; rg += a1; rg2 += a1 * a1; yb += a2; yb2 += a2 * a2;
      if (vorher) diff += Math.abs(l - vorher[j]);
    }
    var m = s / n, sd = Math.sqrt(Math.max(0, s2 / n - m * m));
    // Farbigkeit nach Hasler & Suesstrunk (2003)
    var mrg = rg / n, myb = yb / n, srg = Math.sqrt(Math.max(0, rg2 / n - mrg * mrg)), syb = Math.sqrt(Math.max(0, yb2 / n - myb * myb));
    var farbe = Math.sqrt(srg * srg + syb * syb) + 0.3 * Math.sqrt(mrg * mrg + myb * myb);
    return { hell: m / 255, kontrast: sd / 128, farbe: Math.min(1, farbe / 110), bewegung: vorher ? diff / n / 255 : 0, lum: lum };
  }

  function tonAnalyse(buf, dauer) {
    return new Promise(function (ok) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return ok(null);
      var ctx = new Ctx();
      ctx.decodeAudioData(buf.slice(0), function (audio) {
        var kanal = audio.getChannelData(0), sr = audio.sampleRate, fenster = Math.round(sr * 0.05), n = Math.floor(kanal.length / fenster), laut = [];
        for (var i = 0; i < n; i++) {
          var s = 0; for (var k = i * fenster; k < (i + 1) * fenster; k++) s += kanal[k] * kanal[k];
          laut.push(10 * Math.log10(s / fenster + 1e-10));
        }
        try { ctx.close(); } catch (e) { /* egal */ }
        ok({ laut: laut, takt: 0.05 });
      }, function () { try { ctx.close(); } catch (e) { /* egal */ } ok(null); });
    });
  }

  function analysiere(file, fortschritt) {
    fortschritt = fortschritt || function () {};
    var url = URL.createObjectURL(file), v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
    var cv = document.createElement("canvas"); cv.width = B; cv.height = H;
    var cx = cv.getContext("2d", { willReadFrequently: true });
    var gesichtCv = document.createElement("canvas"); gesichtCv.width = 180; gesichtCv.height = 320;
    var gx = gesichtCv.getContext("2d"), fd = null;
    try { if ("FaceDetector" in window) fd = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 4 }); } catch (e) { fd = null; }

    return warte(v, "loadedmetadata").then(function () {
      var dauer = Math.min(v.duration || 0, 180);
      if (!isFinite(dauer) || dauer <= 0) throw new Error("Unknown video length");
      var zeiten = []; for (var t = 0; t < dauer - 0.01; t += TAKT) zeiten.push(+t.toFixed(2));
      var erg = { dauer: dauer, takt: TAKT, t: zeiten, hell: [], kontrast: [], farbe: [], bewegung: [], gesichter: fd ? [] : null, schnitte: [], laut: [], spruenge: [], ton: false };
      var vorher = null, i = 0;
      function naechstes() {
        if (i >= zeiten.length) return Promise.resolve();
        v.currentTime = Math.min(zeiten[i] + 0.04, dauer - 0.02);
        return warte(v, "seeked").then(function () {
          cx.drawImage(v, 0, 0, B, H);
          var w = bildWerte(cx.getImageData(0, 0, B, H).data, vorher); vorher = w.lum;
          erg.hell.push(+w.hell.toFixed(3)); erg.kontrast.push(+w.kontrast.toFixed(3)); erg.farbe.push(+w.farbe.toFixed(3)); erg.bewegung.push(+w.bewegung.toFixed(4));
          var p = fd ? (gx.drawImage(v, 0, 0, 180, 320), fd.detect(gesichtCv).then(function (f) {
            var flaeche = 0; f.forEach(function (x) { flaeche = Math.max(flaeche, (x.boundingBox.width * x.boundingBox.height) / (180 * 320)); });
            erg.gesichter.push({ n: f.length, groesse: +flaeche.toFixed(3) });
          }).catch(function () { erg.gesichter = null; fd = null; })) : Promise.resolve();
          return p.then(function () { i++; fortschritt(0.1 + 0.8 * i / zeiten.length, "frame " + i + " of " + zeiten.length); return naechstes(); });
        });
      }
      fortschritt(0.02, "reading video …");
      return naechstes().then(function () {
        // Schnitte: Bewegungs-Ausreisser ueber Median + 6 x Median-Abweichung (mindestens 0,12). Mittel und
        // Standardabweichung taugen nicht: die Schnitte selbst blaehen die Streuung auf und verstecken den zweiten.
        var b = erg.bewegung, sortiert = b.slice().sort(function (x, y) { return x - y; });
        var med = sortiert[Math.floor(sortiert.length / 2)] || 0;
        var abw = b.map(function (x) { return Math.abs(x - med); }).sort(function (x, y) { return x - y; });
        var mad = abw[Math.floor(abw.length / 2)] || 0;
        for (var k = 1; k < b.length; k++) if (b[k] > Math.max(0.12, med + 6 * mad) && b[k] >= b[k - 1] && (k + 1 >= b.length || b[k] >= b[k + 1])) erg.schnitte.push(erg.t[k]);
        fortschritt(0.92, "reading audio …");
        return file.arrayBuffer().then(function (buf) { return tonAnalyse(buf, dauer); }).then(function (ton) {
          if (ton && ton.laut.length) {
            erg.ton = true;
            // auf das Bildraster bringen (Maximum im Fenster) und Spruenge (+6 dB in 200 ms) finden
            erg.laut = zeiten.map(function (t0) {
              var a = Math.floor(t0 / ton.takt), z = Math.min(ton.laut.length, Math.floor((t0 + TAKT) / ton.takt)), mx = -100;
              for (var q = a; q < z; q++) mx = Math.max(mx, ton.laut[q]); return +mx.toFixed(1);
            });
            for (var q = 4; q < ton.laut.length; q++) {
              var vorPegel = Math.max(ton.laut[q - 4], ton.laut[q - 3]);
              if (ton.laut[q] - vorPegel > 6 && ton.laut[q] > -35 && (!erg.spruenge.length || q * ton.takt - erg.spruenge[erg.spruenge.length - 1] > 0.5)) erg.spruenge.push(+(q * ton.takt).toFixed(2));
            }
          }
          URL.revokeObjectURL(url);
          fortschritt(1, "done");
          return erg;
        });
      });
    });
  }

  window.PPAnalyse = { analysiere: analysiere };
})();
