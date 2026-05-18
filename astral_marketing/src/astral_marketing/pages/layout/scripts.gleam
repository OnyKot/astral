//// Copyright (C) 2026 Astral Contributors
////
//// This file is part of Astral.
////
//// Astral is free software: you can redistribute it and/or modify
//// it under the terms of the GNU Affero General Public License as published by
//// the Free Software Foundation, either version 3 of the License, or
//// (at your option) any later version.
////
//// Astral is distributed in the hope that it will be useful,
//// but WITHOUT ANY WARRANTY; without even the implied warranty of
//// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
//// GNU Affero General Public License for more details.
////
//// You should have received a copy of the GNU Affero General Public License
//// along with Astral. If not, see <https://www.gnu.org/licenses/>.

import lustre/element.{type Element}
import lustre/element/html

pub fn main_page_script() -> Element(a) {
  html.script(
    [],
    "(function() {
  try {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    if (!('IntersectionObserver' in window)) return
    document.documentElement.classList.add('motion-ready')
  } catch {}
})();

function initLocaleSelector() {
  let localeButton = document.getElementById('locale-button')
  let modalBackdrop = document.getElementById('locale-modal-backdrop')
  let closeButton = document.getElementById('locale-close')

  if (!modalBackdrop || !closeButton) return

  if (localeButton) {
    localeButton.addEventListener('click', function(event) {
      event.preventDefault()
      modalBackdrop.classList.add('show')
      history.pushState(null, '', '#locale-modal-backdrop')
    })
  }

  function closeModal() {
    modalBackdrop.classList.remove('show')
    if (window.location.hash === '#locale-modal-backdrop') {
      history.pushState(null, '', window.location.pathname)
    }
  }

  closeButton.addEventListener('click', function(event) {
    event.preventDefault()
    closeModal()
  })

  modalBackdrop.addEventListener('click', function(event) {
    if (event.target === modalBackdrop) {
      closeModal()
    }
  })

  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && modalBackdrop.classList.contains('show')) {
      closeModal()
    }
  })

  window.addEventListener('hashchange', function() {
    if (window.location.hash === '#locale-modal-backdrop') {
      modalBackdrop.classList.add('show')
    } else {
      modalBackdrop.classList.remove('show')
    }
  })

  if (window.location.hash === '#locale-modal-backdrop') {
    modalBackdrop.classList.add('show')
    history.replaceState(null, '', window.location.pathname)
  }
}

class MasonryLayout {
  constructor(containerId) {
    this.container = document.getElementById(containerId)
    if (!this.container) return

    this.pills = Array.from(this.container.querySelectorAll('.feature-pill'))
    this.resizeObserver = null
    this.rafId = null

    this.init()
  }

  init() {
    this.resizeObserver = new ResizeObserver(() => {
      if (this.rafId) cancelAnimationFrame(this.rafId)
      this.rafId = requestAnimationFrame(() => this.layout())
    })
    this.resizeObserver.observe(this.container)

    this.layout()
  }

  getGap() {
    const width = window.innerWidth
    if (width >= 768) return 20
    if (width >= 640) return 16
    return 10
  }

  layout() {
    if (this.pills.length === 0) return

    this.container.style.transition = 'none'
    this.pills.forEach(pill => {
      pill.style.transition = 'none'
    })

    const gap = this.getGap()
    const containerWidth = this.container.offsetWidth

    if (!this.lastGap || this.lastGap !== gap) {
      this.naturalSizes = null
      this.lastGap = gap
    }

    if (!this.naturalSizes) {
      this.measureNaturalSizes()
    }

    const items = this.pills.map((pill, index) => ({
      el: pill,
      width: this.naturalSizes[index].width,
      height: this.naturalSizes[index].height,
      originalIndex: index
    }))

    const rows = this.packIntoRows(items, containerWidth, gap)

    this.positionPills(rows, containerWidth, gap)

    this.container.offsetHeight

    this.container.style.transition = ''
    this.pills.forEach(pill => {
      pill.style.transition = ''
    })
  }

  measureNaturalSizes() {
    const originalContainerHeight = this.container.style.height
    const originalContainerPosition = this.container.style.position

    this.container.style.height = ''
    this.container.style.position = ''

    const originalPillStyles = this.pills.map(pill => ({
      position: pill.style.position,
      left: pill.style.left,
      top: pill.style.top
    }))

    this.pills.forEach(pill => {
      pill.style.position = 'static'
      pill.style.left = ''
      pill.style.top = ''
    })

    this.container.offsetHeight

    this.naturalSizes = this.pills.map(pill => ({
      width: pill.offsetWidth,
      height: pill.offsetHeight
    }))

    this.container.style.height = originalContainerHeight
    this.container.style.position = originalContainerPosition

    this.pills.forEach((pill, index) => {
      pill.style.position = originalPillStyles[index].position || ''
      pill.style.left = originalPillStyles[index].left || ''
      pill.style.top = originalPillStyles[index].top || ''
    })
  }

  packIntoRows(items, maxWidth, gap) {
    const sortedItems = items.map((item, idx) => ({ ...item, sortIndex: idx }))
      .sort((a, b) => {
        const widthDiff = b.width - a.width
        if (widthDiff !== 0) return widthDiff
        return a.originalIndex - b.originalIndex
      })

    const rows = []

    for (const item of sortedItems) {
      let placed = false
      let bestRowIndex = -1
      let bestRowSpace = Infinity

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const rowWidth = row.reduce((sum, item) => sum + item.width, 0) + (row.length - 1) * gap
        const remainingSpace = maxWidth - rowWidth

        if (remainingSpace >= item.width + (row.length > 0 ? gap : 0)) {
          if (remainingSpace < bestRowSpace) {
            bestRowSpace = remainingSpace
            bestRowIndex = i
          }
        }
      }

      if (bestRowIndex >= 0) {
        rows[bestRowIndex].push(item)
        placed = true
      }

      if (!placed) {
        rows.push([item])
      }
    }

    rows.forEach(row => {
      row.sort((a, b) => a.originalIndex - b.originalIndex)
    })

    return rows
  }

  positionPills(rows, containerWidth, gap) {
    this.container.style.position = 'relative'

    let y = 0

    for (const row of rows) {
      const rowWidth = row.reduce((sum, i) => sum + i.width, 0) + (row.length - 1) * gap
      const rowHeight = Math.max(...row.map(i => i.height))

      let x = (containerWidth - rowWidth) / 2

      for (const item of row) {
        item.el.style.position = 'absolute'
        item.el.style.left = x + 'px'
        item.el.style.top = y + 'px'
        x += item.width + gap
      }

      y += rowHeight + gap
    }

    this.container.style.height = (y - gap) + 'px'
  }

  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
    }
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
    }
  }
}

function initNavToggle() {
  const drawer = document.getElementById('nav-drawer')
  const backdrop = document.getElementById('nav-backdrop')
  const openBtn = document.getElementById('nav-open')
  const closeBtn = document.getElementById('nav-close')
  if (!drawer || !backdrop || !openBtn) return

  const root = document.documentElement

  const setOpen = (open) => {
    root.classList.toggle('nav-open', open)
    openBtn.setAttribute('aria-expanded', open ? 'true' : 'false')
    drawer.setAttribute('aria-hidden', open ? 'false' : 'true')
    backdrop.setAttribute('aria-hidden', open ? 'false' : 'true')

    // Fallback: keep behavior even if CSS is cached/missing.
    document.body.style.overflow = open ? 'hidden' : ''
    drawer.style.transform = open ? 'translateX(0)' : 'translateX(105%)'
    drawer.style.translate = open ? '0 0' : '105% 0'
    backdrop.style.opacity = open ? '1' : '0'
    backdrop.style.pointerEvents = open ? 'auto' : 'none'
  }

  const closeDrawer = () => setOpen(false)
  const toggleDrawer = () => setOpen(!root.classList.contains('nav-open'))

  openBtn.addEventListener('click', (event) => {
    event.preventDefault()
    toggleDrawer()
  })

  if (closeBtn) {
    closeBtn.addEventListener('click', (event) => {
      event.preventDefault()
      closeDrawer()
    })
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDrawer()
  })

  backdrop.addEventListener('click', closeDrawer)

  drawer.querySelectorAll('.nav-drawer-link').forEach((link) => {
    link.addEventListener('click', closeDrawer)
  })

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) closeDrawer()
  })

  setOpen(false)
}

function initNavScroll() {
  const nav = document.getElementById('navbar')
  if (!nav) return
  const onScroll = () => {
    if (window.scrollY > 12) nav.classList.add('scrolled')
    else nav.classList.remove('scrolled')
  }
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
}

function initMotionReveals() {
  const autoTargets = Array.from(document.querySelectorAll(
    '.marketing-page section, .marketing-page .marketing-panel, .marketing-page .reveal-card, .marketing-page .marketing-frame'
  ))
  autoTargets.forEach((el, index) => {
    if (!el.classList.contains('motion-reveal')) {
      el.classList.add('motion-reveal')
    }
    if (!el.dataset.motionDelay) {
      const delay = Math.min(index, 6) * 80
      el.dataset.motionDelay = `${delay}ms`
    }
  })

  const els = Array.from(document.querySelectorAll('.motion-reveal'))
  if (els.length === 0) return

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce) {
    els.forEach(el => el.classList.add('is-visible'))
    return
  }

  if (!('IntersectionObserver' in window)) {
    els.forEach(el => el.classList.add('is-visible'))
    return
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible')
        io.unobserve(entry.target)
      }
    })
  }, { root: null, rootMargin: '0px 0px -10% 0px', threshold: 0.15 })

  els.forEach(el => {
    const delay = el.getAttribute('data-motion-delay')
    if (delay) el.style.transitionDelay = delay
    io.observe(el)
  })
}

function initPageTransitions() {
  const root = document.documentElement
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce) return

  // BFCache restores may keep transient classes from before navigation.
  window.addEventListener('pageshow', () => {
    root.classList.remove('page-leaving')
  })

  const isModified = (event) => event.metaKey || event.ctrlKey || event.shiftKey || event.altKey

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented) return
    if (event.button !== 0) return
    if (isModified(event)) return

    const target = event.target
    if (!target || !target.closest) return

    const a = target.closest('a')
    if (!a) return

    if (a.hasAttribute('data-no-transition')) return
    if (a.hasAttribute('download')) return

    const targetAttr = a.getAttribute('target')
    if (targetAttr && targetAttr !== '_self') return

    const href = a.getAttribute('href')
    if (!href) return
    if (href.startsWith('#')) return
    if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('sms:')) return

    let url
    try { url = new URL(href, window.location.href) } catch { return }
    if (url.origin !== window.location.origin) return

    const samePath = url.pathname === window.location.pathname && url.search === window.location.search
    if (samePath && url.hash && url.hash !== window.location.hash) return

    if (url.href === window.location.href) return

    event.preventDefault()
    root.classList.add('page-leaving')
    setTimeout(() => {
      window.location.href = url.href
    }, 180)
  })
}

document.addEventListener('DOMContentLoaded', function() {
  initLocaleSelector()
  initNavToggle()
  initNavScroll()
  new MasonryLayout('coming-features-list')
  initMotionReveals()
  initPageTransitions()
})",
  )
}

pub fn download_script() -> Element(a) {
  html.script(
    [],
    "
(function() {
  const DEBUG = true;
  const log = (...args) => DEBUG && console.log('[Astral DL]', ...args);

  function detectRuntimePlatform() {
    const hinted = (navigator.userAgentData?.platform || '').toLowerCase();
    if (hinted.includes('windows')) return 'windows';
    if (hinted.includes('mac')) return 'macos';
    if (hinted.includes('linux')) return 'linux';
    if (hinted.includes('android')) return 'android';
    if (hinted.includes('ios')) return 'ios';

    const ua = (navigator.userAgent || '').toLowerCase();
    if (ua.includes('android')) return 'android';
    if (ua.includes('iphone') || ua.includes('ipad')) return 'ios';
    if (ua.includes('windows')) return 'windows';
    if (ua.includes('mac os x') || ua.includes('macintosh')) return 'macos';
    if (ua.includes('linux')) return 'linux';
    return 'unknown';
  }

  async function detectArch() {
    log('Detecting architecture...');

    if (navigator.userAgentData?.getHighEntropyValues) {
      try {
        const hints = await navigator.userAgentData.getHighEntropyValues(['architecture', 'bitness']);
        log('UA Client Hints:', hints);
        const archHint = hints.architecture?.toLowerCase() || '';
        const bitness = hints.bitness?.toLowerCase() || '';
        const platform = (navigator.userAgentData.platform || '').toLowerCase();

        if (platform === 'windows') {
          if (archHint === 'arm') {
            log('Detected arm64 via Client Hints (Windows)');
            return 'arm64';
          }
          if (archHint === 'x86' && bitness === '64') {
            log('Detected x64 via Client Hints (Windows)');
            return 'x64';
          }
        }

        if (archHint.includes('arm')) {
          log('Detected arm64 via Client Hints (generic)');
          return 'arm64';
        }
      } catch (e) {
        log('Client Hints error:', e);
      }
    }

    const platform = navigator.platform || '';
    log('Platform:', platform);
    if (/mac/i.test(platform)) {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
          const ext = gl.getExtension('WEBGL_debug_renderer_info');
          if (ext) {
            const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
            log('WebGL renderer:', renderer);
            if (/Apple M/i.test(renderer)) {
              log('Detected arm64 via WebGL (Apple Silicon)');
              return 'arm64';
            }
            if (/Intel/i.test(renderer)) {
              log('Detected x64 via WebGL (Intel)');
              return 'x64';
            }
          } else {
            log('WEBGL_debug_renderer_info not available');
          }
        } else {
          log('WebGL context not available');
        }
      } catch (e) {
        log('WebGL error:', e);
      }
    }

    const ua = navigator.userAgent.toLowerCase();
    log('User-Agent:', ua);
    if (/arm64|aarch64/.test(ua)) {
      log('Detected arm64 via UA string');
      return 'arm64';
    }
    if (/win64|x86_64|x64/.test(ua)) {
      log('Detected x64 via UA string');
      return 'x64';
    }

    log('Could not detect architecture');
    return null;
  }

  function updateButtonArch(container, arch) {
    const mainLink = container.querySelector('.download-link');
    if (!mainLink) {
      log('No .download-link found in', container.id);
      return;
    }
    if (mainLink.dataset.arch === arch) {
      log('Already correct arch for', container.id);
      return;
    }

    const parent = container.parentElement;
    const overlay = parent?.querySelector('.download-overlay-link[data-arch=\"' + arch + '\"]');
    if (!overlay) {
      log('No overlay link for arch', arch, 'in', container.id);
      return;
    }

    log('Updating', container.id, 'to', arch);

    const baseUrl = overlay.dataset.baseUrl;
    mainLink.href = baseUrl;
    mainLink.dataset.baseUrl = baseUrl;
    mainLink.dataset.arch = arch;
    mainLink.dataset.format = overlay.dataset.format;

    const platform = mainLink.dataset.platform || '';
    const helper = mainLink.querySelector('.text-sm');
    if (helper) {
      if (platform.includes('macos')) helper.textContent = arch === 'arm64' ? 'Apple Silicon · DMG' : 'Intel · DMG';
      else if (platform.includes('windows')) helper.textContent = arch + ' · EXE';
      else if (platform.includes('linux')) helper.textContent = 'Choose distribution';
    }
  }

  function initOverlays() {
    const toggles = document.querySelectorAll('.overlay-toggle');
    log('Found', toggles.length, 'overlay toggles');

    const closeAll = () => {
      document.querySelectorAll('.download-overlay').forEach(el => el.classList.add('hidden'));
    };

    toggles.forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const targetId = btn.dataset.overlayTarget;
        const overlay = document.getElementById(targetId);
        log('Toggle clicked, target:', targetId, 'found:', !!overlay);
        if (!overlay) return;
        const wasHidden = overlay.classList.contains('hidden');
        closeAll();
        if (wasHidden) overlay.classList.remove('hidden');
      });
    });

    document.addEventListener('click', closeAll);
    document.addEventListener('keydown', e => e.key === 'Escape' && closeAll());
  }

  function initPwaDialog() {
    const openBtn = document.getElementById('pwa-install-button');
    const modal = document.getElementById('pwa-modal-backdrop');
    const closeBtn = document.getElementById('pwa-close');
    const tabs = document.querySelectorAll('.pwa-tab');
    const panels = document.querySelectorAll('.pwa-panel');

    if (!modal) return;

    const openModal = () => modal.classList.add('show');
    const closeModal = () => modal.classList.remove('show');

    if (openBtn) {
      openBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openModal();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal();
      });
    }

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('show')) {
        closeModal();
      }
    });

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetId = tab.dataset.tab;

        tabs.forEach(t => {
          t.classList.remove('bg-white', 'text-gray-900', 'shadow-sm');
          t.classList.add('text-gray-600');
        });
        tab.classList.remove('text-gray-600');
        tab.classList.add('bg-white', 'text-gray-900', 'shadow-sm');

        panels.forEach(p => p.classList.add('hidden'));
        const targetPanel = document.getElementById('pwa-panel-' + targetId);
        if (targetPanel) targetPanel.classList.remove('hidden');
      });
    });
  }

  async function init() {
    log('Initializing...');
    initOverlays();
    initPwaDialog();
    const arch = await detectArch();
    const runtimePlatform = detectRuntimePlatform();
    log('Runtime platform:', runtimePlatform);
    if (arch) {
      const containers = document.querySelectorAll('[id$=\"-download-buttons\"]');
      log('Found', containers.length, 'download button containers');
      containers.forEach(c => {
        const mainLink = c.querySelector('.download-link');
        const platform = mainLink?.dataset?.platform || '';

        if (platform.includes('windows') && runtimePlatform !== 'windows') {
          return;
        }

        if (platform.includes('macos') && runtimePlatform !== 'macos') {
          return;
        }

        if (platform.includes('linux') && runtimePlatform !== 'linux') {
          return;
        }

        if (platform.includes('macos') && arch === 'arm64') {
          log('Skipping update for macOS arm64 (already default)');
          return;
        }

        updateButtonArch(c, arch);
      });
    }
    log('Init complete');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
",
  )
}

pub fn docs_page_script() -> Element(a) {
  html.script(
    [],
    "
(function() {
  function initLocaleSelector() {
    const btn = document.getElementById('locale-button');
    const modal = document.getElementById('locale-modal-backdrop');
    const close = document.getElementById('locale-close');
    if (!modal || !close) return;

    const closeModal = () => {
      modal.classList.remove('show');
      if (location.hash === '#locale-modal-backdrop') {
        history.pushState(null, '', location.pathname);
      }
    };

    if (btn) {
      btn.addEventListener('click', e => {
        e.preventDefault();
        modal.classList.add('show');
        history.pushState(null, '', '#locale-modal-backdrop');
      });
    }

    close.addEventListener('click', e => { e.preventDefault(); closeModal(); });
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('show')) closeModal(); });
    window.addEventListener('hashchange', () => modal.classList.toggle('show', location.hash === '#locale-modal-backdrop'));

    if (location.hash === '#locale-modal-backdrop') {
      modal.classList.add('show');
      history.replaceState(null, '', location.pathname);
    }
  }

  function initNavToggle() {
    const drawer = document.getElementById('nav-drawer');
    const backdrop = document.getElementById('nav-backdrop');
    const openBtn = document.getElementById('nav-open');
    const closeBtn = document.getElementById('nav-close');
    if (!drawer || !backdrop || !openBtn) return;

    const root = document.documentElement;

    const setOpen = (open) => {
      root.classList.toggle('nav-open', open);
      openBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
      backdrop.setAttribute('aria-hidden', open ? 'false' : 'true');

      // Fallback: keep behavior even if CSS is cached/missing.
      document.body.style.overflow = open ? 'hidden' : '';
      drawer.style.transform = open ? 'translateX(0)' : 'translateX(105%)';
      drawer.style.translate = open ? '0 0' : '105% 0';
      backdrop.style.opacity = open ? '1' : '0';
      backdrop.style.pointerEvents = open ? 'auto' : 'none';
    };

    const closeDrawer = () => setOpen(false);
    const toggleDrawer = () => setOpen(!root.classList.contains('nav-open'));

    openBtn.addEventListener('click', (event) => {
      event.preventDefault();
      toggleDrawer();
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', (event) => {
        event.preventDefault();
        closeDrawer();
      });
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeDrawer();
    });

    backdrop.addEventListener('click', closeDrawer);

    drawer.querySelectorAll('.nav-drawer-link').forEach((link) => {
      link.addEventListener('click', closeDrawer);
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth >= 1024) closeDrawer();
    });

    setOpen(false);
  }

  function initNavScroll() {
    const nav = document.getElementById('navbar');
    if (!nav) return;
    const onScroll = () => {
      if (window.scrollY > 12) nav.classList.add('scrolled');
      else nav.classList.remove('scrolled');
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initLocaleSelector();
    initNavToggle();
    initNavScroll();
  });
})();
",
  )
}
