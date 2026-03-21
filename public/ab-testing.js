// Voglia di Pizza — A/B Testing Engine v2
// 12 experiments, deterministic bucket, localStorage tracking, 10-day window
(function() {
  'use strict';
  var STORAGE_KEY = 'vdp_ab_events';
  var BUCKET_KEY = 'vdp_ab_bucket';
  var START_KEY = 'vdp_ab_start';

  // 12 experiments
  var EXPERIMENTS = {
    headline:              { variants: ['potente','empatico','urgente'] },
    cta_text:              { variants: ['inizia','scopri','crea'] },
    meta_description:      { variants: ['conversioni','velocita','risparmio'] },
    tagline_hero:          { variants: ['default','breve','numeri'] },
    problem_framing:       { variants: ['euro','percentuale','storia'] },
    social_proof_position: { variants: ['standard','prominente'] },
    step_labels:           { variants: ['passi','steps','bar'] },
    submit_cta:            { variants: ['invia','voglio_sito','inizia_gratis'] },
    pricing_hint:          { variants: ['no_price','con_price'] },
    form_order:            { variants: ['nome_prima','menu_prima'] },
    hero_subtext:          { variants: ['v1','v2','v3'] },
    trust_footer:          { variants: ['email','whatsapp','24ore'] }
  };

  // Deterministic bucket from sessionStorage
  function getBucket() {
    var b = sessionStorage.getItem(BUCKET_KEY);
    if (b) return parseFloat(b);
    b = Math.random();
    sessionStorage.setItem(BUCKET_KEY, b.toString());
    return b;
  }

  // Record start date for 10-day window
  function ensureStartDate() {
    if (!localStorage.getItem(START_KEY)) {
      localStorage.setItem(START_KEY, new Date().toISOString().slice(0, 10));
    }
  }

  // Simple hash: multiply and take fractional part
  function pseudoHash(val, seed) {
    var x = Math.sin(val * 9999 + seed * 7777) * 10000;
    return x - Math.floor(x);
  }

  // Assign variants deterministically from bucket
  function assignVariants() {
    var bucket = getBucket();
    var assignments = {};
    var idx = 0;
    for (var exp in EXPERIMENTS) {
      var vars = EXPERIMENTS[exp].variants;
      var h = pseudoHash(bucket, idx);
      assignments[exp] = vars[Math.floor(h * vars.length)];
      idx++;
    }
    return assignments;
  }

  var variants = assignVariants();
  ensureStartDate();

  // Event tracking
  function trackEvent(event, data) {
    var entry = {
      event: event,
      variants: variants,
      data: data || {},
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().slice(0, 10),
      url: location.pathname,
      referrer: document.referrer || ''
    };
    var events = [];
    try { events = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch(e) {}
    events.push(entry);
    if (events.length > 10000) events = events.slice(-10000);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  }

  // Auto-track page view on homepage only
  if (location.pathname === '/' || location.pathname === '/index.html') {
    trackEvent('page_view');
  }

  // Slide tracking
  var maxSlide = 0;
  function trackSlide(n) {
    if (n > maxSlide) {
      maxSlide = n;
      trackEvent('slide_view', { slide: n });
      if (n === 4) trackEvent('form_start');
    }
  }

  function trackFormComplete() {
    trackEvent('form_complete');
  }

  // DOM helpers
  function q(sel) { return document.querySelector(sel); }

  // Apply all 12 experiments to DOM
  function applyExperiments() {
    // 1. headline
    var heroH1 = q('[data-i="0"] .t-hero');
    if (heroH1) {
      if (variants.headline === 'empatico') {
        heroH1.innerHTML = 'La tua<br/>pizzeria <em class="t-italic t-warm">merita</em>';
      } else if (variants.headline === 'urgente') {
        heroH1.innerHTML = 'Domani sei<br/><em class="t-italic t-warm">online</em>';
      }
      // 'potente' = default, keep original
    }

    // 2. cta_text (hero CTA button)
    var heroCta = q('[data-i="0"] .cta');
    if (heroCta) {
      if (variants.cta_text === 'scopri') {
        heroCta.childNodes[0].textContent = 'Scopri come ';
      } else if (variants.cta_text === 'crea') {
        heroCta.childNodes[0].textContent = 'Crea il tuo sito ';
      }
      // 'inizia' = default
    }

    // 3. meta_description
    var metaDesc = q('meta[name="description"]');
    if (metaDesc) {
      if (variants.meta_description === 'velocita') {
        metaDesc.setAttribute('content', 'Sito web per pizzeria pronto in 24 ore. Menu digitale e ordini WhatsApp senza commissioni.');
      } else if (variants.meta_description === 'risparmio') {
        metaDesc.setAttribute('content', 'Basta commissioni del 30%. Sito pizzeria con menu e ordini diretti WhatsApp. Zero costi nascosti.');
      }
      // 'conversioni' = default
    }

    // 4. tagline_hero
    var heroBody = q('[data-i="0"] .t-body');
    if (heroBody) {
      if (variants.tagline_hero === 'breve') {
        heroBody.innerHTML = 'Menu, ordini, dashboard.<br/>Tutto in 24 ore.';
      } else if (variants.tagline_hero === 'numeri') {
        heroBody.innerHTML = 'Zero commissioni. 24 ore. 1 form.<br/>Il tuo sito pizzeria completo.';
      }
      // 'default' = keep original
    }

    // 5. problem_framing (slide 1)
    var probSlide = q('[data-i="1"]');
    if (probSlide) {
      var probTexts = probSlide.querySelectorAll('.t-body');
      if (probTexts[0]) {
        if (variants.problem_framing === 'percentuale') {
          probTexts[0].textContent = 'Le piattaforme trattengono il 15\u201330% di ogni ordine. Su 100 pizze al giorno, sono 20\u201360 pizze regalate ogni mese.';
        } else if (variants.problem_framing === 'storia') {
          probTexts[0].textContent = 'Marco ha una pizzeria a Bergamo. Ogni mese paga 900\u20AC di commissioni alle app. Con quei soldi potrebbe comprare un forno nuovo ogni trimestre.';
        }
        // 'euro' = default
      }
    }

    // 6. social_proof_position
    if (variants.social_proof_position === 'prominente') {
      var solInner = q('[data-i="2"] .slide-inner');
      if (solInner) {
        var proof = document.createElement('div');
        proof.className = 'reveal-text d4';
        proof.style.cssText = 'margin-top:1.5rem;padding:12px 16px;background:rgba(0,0,0,0.03);border-radius:8px;font-size:0.9rem;color:var(--fg-3);text-align:center;';
        proof.innerHTML = '<strong>Usato da pizzerie in tutta Italia</strong> \u2014 da Bergamo a Napoli';
        solInner.appendChild(proof);
      }
    }

    // 7. step_labels (slides 4-8)
    for (var si = 4; si <= 8; si++) {
      var ey = q('[data-i="' + si + '"] .t-eyebrow');
      if (!ey) continue;
      var num = si - 3;
      if (variants.step_labels === 'steps') {
        ey.textContent = 'Step ' + num + '/5';
      } else if (variants.step_labels === 'bar') {
        ey.textContent = '\u2588'.repeat(num) + '\u2591'.repeat(5 - num) + ' ' + num + '/5';
      }
      // 'passi' = default "Passo X di 5"
    }

    // 8. submit_cta
    var sendBtn = q('#sendBtn');
    if (sendBtn) {
      if (variants.submit_cta === 'voglio_sito') {
        sendBtn.childNodes[0].textContent = 'Voglio il mio sito ';
      } else if (variants.submit_cta === 'inizia_gratis') {
        sendBtn.childNodes[0].textContent = 'Inizia gratis ';
      }
      // 'invia' = default
    }

    // 9. pricing_hint
    if (variants.pricing_hint === 'con_price') {
      var demoLink = q('[data-i="3"] .cta-ghost');
      if (demoLink) {
        var hint = document.createElement('p');
        hint.className = 't-small reveal-text d4';
        hint.style.cssText = 'color:rgba(255,255,255,0.4);margin-top:0.8rem;text-align:center;';
        hint.textContent = 'A partire da 0\u20AC \u2014 paghi solo se sei soddisfatto';
        demoLink.parentNode.insertBefore(hint, demoLink.nextSibling);
      }
    }

    // 10. form_order — tracked as variant, no DOM swap (architectural note: would require deep refactor)

    // 11. hero_subtext (eyebrow text)
    var heroEye = q('[data-i="0"] .t-eyebrow');
    if (heroEye) {
      if (variants.hero_subtext === 'v2') {
        heroEye.textContent = 'Il tuo sito pizzeria in 24 ore';
      } else if (variants.hero_subtext === 'v3') {
        heroEye.textContent = 'Zero commissioni, zero stress';
      }
      // 'v1' = default
    }

    // 12. trust_footer (success slide)
    var successSmall = q('[data-i="9"] .t-small');
    if (successSmall) {
      if (variants.trust_footer === 'whatsapp') {
        successSmall.innerHTML = 'Voglia di Pizza &copy; 2026 \u2014 <a href="https://wa.me/393481234567" style="color:rgba(255,255,255,0.5);">Scrivici su WhatsApp</a>';
      } else if (variants.trust_footer === '24ore') {
        successSmall.innerHTML = 'Voglia di Pizza &copy; 2026 \u2014 Risposta garantita entro 24 ore';
      }
      // 'email' = default
    }
  }

  // Expose API
  window.ABTesting = {
    variants: variants,
    trackSlide: trackSlide,
    trackFormComplete: trackFormComplete,
    trackEvent: trackEvent,
    getVariants: function() { return variants; },
    getEvents: function() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch(e) { return []; }
    },
    getStartDate: function() { return localStorage.getItem(START_KEY); },
    EXPERIMENTS: EXPERIMENTS
  };

  // Apply on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyExperiments);
  } else {
    applyExperiments();
  }
})();
