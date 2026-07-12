/* how-it-works.js — Scroll animations, parallax, perf bars */
(function () {
  'use strict';

  // ── Scroll reveal ──────────────────────────────────────────
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('hiw-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  document.querySelectorAll('.hiw-section__inner > *').forEach((el) => {
    revealObserver.observe(el);
  });

  // ── Performance bars ───────────────────────────────────────
  const perfObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const fills = entry.target.querySelectorAll('.hiw-perf-bar__fill');
        const widths = [72, 55, 65, 48, 50]; // visual %
        fills.forEach((fill, i) => {
          setTimeout(() => {
            fill.style.width = (widths[i] || 60) + '%';
          }, i * 120);
        });
        perfObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.3 }
  );

  const perfGrid = document.querySelector('.hiw-perf-grid');
  if (perfGrid) perfObserver.observe(perfGrid);

  // ── Parallax hero bg ──────────────────────────────────────
  const heroBg = document.querySelector('.hiw-hero__bg');
  if (heroBg) {
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      heroBg.style.transform = 'translateY(' + y * 0.4 + 'px)';
    }, { passive: true });
  }

  // ── Arch diagram stagger ──────────────────────────────────
  const archObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const items = entry.target.querySelectorAll(
          '.hiw-arch-layer, .hiw-arch-service, .hiw-db-tag'
        );
        items.forEach((el, i) => {
          el.style.opacity = '0';
          el.style.transform = 'translateY(20px)';
          setTimeout(() => {
            el.style.transition = 'opacity 0.5s, transform 0.5s cubic-bezier(0.22,1,0.36,1)';
            el.style.opacity = '1';
            el.style.transform = 'none';
          }, i * 80);
        });
        archObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.2 }
  );

  const archDiagram = document.querySelector('.hiw-arch-diagram');
  if (archDiagram) archObserver.observe(archDiagram);

  // ── WS flow stagger ───────────────────────────────────────
  const wsObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const steps = entry.target.querySelectorAll('.hiw-ws-step, .hiw-ws-arrow');
        steps.forEach((el, i) => {
          el.style.opacity = '0';
          el.style.transform = 'translateX(-16px)';
          setTimeout(() => {
            el.style.transition = 'opacity 0.4s, transform 0.4s cubic-bezier(0.22,1,0.36,1)';
            el.style.opacity = '1';
            el.style.transform = 'none';
          }, i * 100);
        });
        wsObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.3 }
  );

  const wsFlow = document.querySelector('.hiw-ws-flow');
  if (wsFlow) wsObserver.observe(wsFlow);

  // ── Security layers stagger ───────────────────────────────
  const secObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const layers = entry.target.querySelectorAll('.hiw-sec-layer');
        layers.forEach((el, i) => {
          el.style.opacity = '0';
          el.style.transform = 'translateX(-24px)';
          setTimeout(() => {
            el.style.transition = 'opacity 0.5s, transform 0.5s cubic-bezier(0.22,1,0.36,1)';
            el.style.opacity = '1';
            el.style.transform = 'none';
          }, i * 100);
        });
        secObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.2 }
  );

  const secLayers = document.querySelector('.hiw-security-layers');
  if (secLayers) secObserver.observe(secLayers);

  // ── Stats counter animation ───────────────────────────────
  const statsObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const stats = entry.target.querySelectorAll('.hiw-stat');
        stats.forEach((el, i) => {
          el.style.opacity = '0';
          el.style.transform = 'scale(0.85)';
          setTimeout(() => {
            el.style.transition = 'opacity 0.5s, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)';
            el.style.opacity = '1';
            el.style.transform = 'none';
          }, i * 120);
        });
        statsObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.3 }
  );

  const statsRow = document.querySelector('.hiw-stats-row');
  if (statsRow) statsObserver.observe(statsRow);

  // ── Smooth scroll for nav ─────────────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href').slice(1);
      const target = document.getElementById(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
})();
