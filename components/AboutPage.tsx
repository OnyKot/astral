import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Share2, Server, Shield, Cpu, Activity, Lock, Globe, FileText, Search, ChevronUp } from './Icon';
import { Language } from '../types';
import { translations } from '../translations';

interface AboutPageProps {
  onBack: () => void;
  lang: Language;
}

const AboutPage: React.FC<AboutPageProps> = ({ onBack, lang }) => {
  const t = translations[lang];
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [isShareCopied, setIsShareCopied] = useState(false);
  const scalingRows = [
    { users: '2', connections: '1', upload: '~2 Mbps', cpu: t.about.cpu_low, profile: t.about.scaling_profile_1 },
    { users: '4', connections: '6', upload: '~4-6 Mbps', cpu: t.about.cpu_medium, profile: t.about.scaling_profile_2 },
    { users: '8', connections: '28', upload: '~8-14 Mbps', cpu: t.about.cpu_high, profile: t.about.scaling_profile_3 },
    { users: '12', connections: '66', upload: '~14-22 Mbps', cpu: t.about.cpu_very_high, profile: t.about.scaling_profile_4 },
  ];
  const resilienceSteps = [
    t.about.section_6_step_1,
    t.about.section_6_step_2,
    t.about.section_6_step_3,
    t.about.section_6_step_4,
  ];
  const operatorChecklist = [
    t.about.section_7_item_1,
    t.about.section_7_item_2,
    t.about.section_7_item_3,
    t.about.section_7_item_4,
    t.about.section_7_item_5,
  ];
  const limitations = [
    t.about.section_8_limit_1,
    t.about.section_8_limit_2,
    t.about.section_8_limit_3,
    t.about.section_8_limit_4,
  ];
  const faq = [
    { q: t.about.faq_q1, a: t.about.faq_a1 },
    { q: t.about.faq_q2, a: t.about.faq_a2 },
    { q: t.about.faq_q3, a: t.about.faq_a3 },
    { q: t.about.faq_q4, a: t.about.faq_a4 },
  ];
  const lifecycleSteps = [
    t.about.section_10_step_1,
    t.about.section_10_step_2,
    t.about.section_10_step_3,
    t.about.section_10_step_4,
    t.about.section_10_step_5,
    t.about.section_10_step_6,
  ];
  const threatRows = [
    { threat: t.about.threat_row_1_a, path: t.about.threat_row_1_b, mitigation: t.about.threat_row_1_c },
    { threat: t.about.threat_row_2_a, path: t.about.threat_row_2_b, mitigation: t.about.threat_row_2_c },
    { threat: t.about.threat_row_3_a, path: t.about.threat_row_3_b, mitigation: t.about.threat_row_3_c },
    { threat: t.about.threat_row_4_a, path: t.about.threat_row_4_b, mitigation: t.about.threat_row_4_c },
    { threat: t.about.threat_row_5_a, path: t.about.threat_row_5_b, mitigation: t.about.threat_row_5_c },
  ];
  const adaptationChecklist = [
    t.about.section_12_item_1,
    t.about.section_12_item_2,
    t.about.section_12_item_3,
    t.about.section_12_item_4,
    t.about.section_12_item_5,
    t.about.section_12_item_6,
  ];
  const troubleshootingRows = [
    { symptom: t.about.troubles_row_1_a, cause: t.about.troubles_row_1_b, action: t.about.troubles_row_1_c },
    { symptom: t.about.troubles_row_2_a, cause: t.about.troubles_row_2_b, action: t.about.troubles_row_2_c },
    { symptom: t.about.troubles_row_3_a, cause: t.about.troubles_row_3_b, action: t.about.troubles_row_3_c },
    { symptom: t.about.troubles_row_4_a, cause: t.about.troubles_row_4_b, action: t.about.troubles_row_4_c },
    { symptom: t.about.troubles_row_5_a, cause: t.about.troubles_row_5_b, action: t.about.troubles_row_5_c },
    { symptom: t.about.troubles_row_6_a, cause: t.about.troubles_row_6_b, action: t.about.troubles_row_6_c },
  ];
  const runbookChecklist = [
    t.about.section_14_ops_1,
    t.about.section_14_ops_2,
    t.about.section_14_ops_3,
    t.about.section_14_ops_4,
    t.about.section_14_ops_5,
  ];
  const sloTargets = [
    t.about.section_14_slo_1,
    t.about.section_14_slo_2,
    t.about.section_14_slo_3,
    t.about.section_14_slo_4,
    t.about.section_14_slo_5,
  ];
  const glossary = [
    { term: t.about.glossary_1_t, desc: t.about.glossary_1_d },
    { term: t.about.glossary_2_t, desc: t.about.glossary_2_d },
    { term: t.about.glossary_3_t, desc: t.about.glossary_3_d },
    { term: t.about.glossary_4_t, desc: t.about.glossary_4_d },
    { term: t.about.glossary_5_t, desc: t.about.glossary_5_d },
    { term: t.about.glossary_6_t, desc: t.about.glossary_6_d },
    { term: t.about.glossary_7_t, desc: t.about.glossary_7_d },
    { term: t.about.glossary_8_t, desc: t.about.glossary_8_d },
  ];
  const tocItems = useMemo(
    () => [
      { id: 'section-1', label: t.about.section_1_title },
      { id: 'section-2', label: t.about.section_2_title },
      { id: 'section-3', label: t.about.section_3_title },
      { id: 'section-4', label: t.about.section_4_title },
      { id: 'section-5', label: t.about.section_5_title },
      { id: 'section-6', label: t.about.section_6_title },
      { id: 'section-7', label: t.about.section_7_title },
      { id: 'section-8', label: t.about.section_8_title },
      { id: 'section-9', label: t.about.faq_title },
      { id: 'section-10', label: t.about.section_10_title },
      { id: 'section-11', label: t.about.section_11_title },
      { id: 'section-12', label: t.about.section_12_title },
      { id: 'section-13', label: t.about.section_13_title },
      { id: 'section-14', label: t.about.section_14_title },
      { id: 'section-15', label: t.about.section_15_title },
      { id: 'section-16', label: t.about.section_16_title },
      { id: 'section-17', label: t.about.section_17_title },
      { id: 'section-18', label: t.about.section_18_title },
    ],
    [
      t.about.section_1_title,
      t.about.section_2_title,
      t.about.section_3_title,
      t.about.section_4_title,
      t.about.section_5_title,
      t.about.section_6_title,
      t.about.section_7_title,
      t.about.section_8_title,
      t.about.faq_title,
      t.about.section_10_title,
      t.about.section_11_title,
      t.about.section_12_title,
      t.about.section_13_title,
      t.about.section_14_title,
      t.about.section_15_title,
      t.about.section_16_title,
      t.about.section_17_title,
      t.about.section_18_title,
    ],
  );
  const governancePrinciples = [
    t.about.section_17_gov_1,
    t.about.section_17_gov_2,
    t.about.section_17_gov_3,
    t.about.section_17_gov_4,
    t.about.section_17_gov_5,
  ];
  const releaseChannels = [
    t.about.section_17_release_1,
    t.about.section_17_release_2,
    t.about.section_17_release_3,
    t.about.section_17_release_4,
  ];
  const appendixRows = [
    { scenario: t.about.appendix_row_1_a, indicator: t.about.appendix_row_1_b, action: t.about.appendix_row_1_c },
    { scenario: t.about.appendix_row_2_a, indicator: t.about.appendix_row_2_b, action: t.about.appendix_row_2_c },
    { scenario: t.about.appendix_row_3_a, indicator: t.about.appendix_row_3_b, action: t.about.appendix_row_3_c },
    { scenario: t.about.appendix_row_4_a, indicator: t.about.appendix_row_4_b, action: t.about.appendix_row_4_c },
    { scenario: t.about.appendix_row_5_a, indicator: t.about.appendix_row_5_b, action: t.about.appendix_row_5_c },
  ];
  const closingChecklist = [
    t.about.closing_item_1,
    t.about.closing_item_2,
    t.about.closing_item_3,
    t.about.closing_item_4,
  ];
  const [tocQuery, setTocQuery] = useState('');
  const [activeSection, setActiveSection] = useState('section-1');
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const filteredTocItems = useMemo(
    () =>
      tocItems.filter((item) =>
        item.label.toLowerCase().includes(tocQuery.trim().toLowerCase()),
      ),
    [tocItems, tocQuery],
  );

  const scrollToSection = (sectionId: string) => {
    const container = scrollContainerRef.current;
    const target = document.getElementById(sectionId);
    if (!target || !container) return;
    const topOffset = 92;
    const relativeTop =
      target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    container.scrollTo({ top: Math.max(0, relativeTop - topOffset), behavior: 'smooth' });
  };

  const handleBackToTop = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleShareWhitepaper = async () => {
    const link = `${window.location.origin}${window.location.pathname}?view=about`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: t.about.title,
          text: t.about.subtitle,
          url: link,
        });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(link);
      setIsShareCopied(true);
      window.setTimeout(() => setIsShareCopied(false), 1800);
    } catch {}
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const maxScrollable = container.scrollHeight - container.clientHeight;
      const progress = maxScrollable > 0 ? (container.scrollTop / maxScrollable) * 100 : 0;
      setScrollProgress(progress);
      setShowBackToTop(container.scrollTop > 500);
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const mostVisible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (mostVisible?.target?.id) {
          setActiveSection(mostVisible.target.id);
        }
      },
      {
        root: container,
        threshold: [0.2, 0.35, 0.5, 0.75],
        rootMargin: '-90px 0px -55% 0px',
      },
    );

    for (const item of tocItems) {
      const section = document.getElementById(item.id);
      if (section) observer.observe(section);
    }

    return () => observer.disconnect();
  }, [tocItems, lang]);

  return (
    <div ref={scrollContainerRef} className="min-h-[100svh] w-full bg-[#020202] text-gray-200 relative overflow-y-auto overflow-x-hidden font-sans selection:bg-indigo-500/30 touch-auto scroll-smooth">
      <div className="fixed top-0 left-0 right-0 h-[2px] bg-white/5 z-[60]">
        <div className="h-full bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 transition-[width] duration-150" style={{ width: `${scrollProgress}%` }} />
      </div>
      
      {/* Background Layers */}
      <div className="fixed inset-0 pointer-events-none z-0 transform-gpu">
          <div className="absolute top-[-10%] left-[10%] sm:left-[20%] w-[500px] sm:w-[800px] h-[500px] sm:h-[800px] bg-indigo-900/10 rounded-full blur-[80px] sm:blur-[120px] opacity-40 animate-pulse-slow will-change-transform" />
          <div className="absolute bottom-[-10%] right-[10%] sm:right-[20%] w-[400px] sm:w-[600px] h-[400px] sm:h-[600px] bg-cyan-900/10 rounded-full blur-[80px] sm:blur-[120px] opacity-30 will-change-transform" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_110%)]"></div>
      </div>

      <div className="fixed top-4 left-0 right-0 z-50 px-4 md:px-6 pointer-events-none flex justify-center transition-all duration-500">
          <nav className="pointer-events-auto w-full max-w-5xl rounded-2xl md:rounded-[2rem] transition-all duration-500 border bg-black/60 backdrop-blur-2xl border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.4)] py-3 px-4 md:px-6 flex justify-between items-center">
            <button 
                onClick={onBack}
                className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors group"
            >
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center border border-white/10 group-hover:bg-white/10 group-hover:border-white/30 transition-all active:scale-95">
                    <ChevronLeft size={16} />
                </div>
                <span className="text-xs sm:text-sm font-bold tracking-widest uppercase">{t.nav.back}</span>
            </button>
            
            <div className="flex items-center gap-2 md:gap-3">
                <button
                    onClick={handleShareWhitepaper}
                    className="h-8 px-3 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 transition-all text-[10px] md:text-xs font-bold uppercase tracking-wider flex items-center gap-2 active:scale-95"
                >
                    <Share2 size={14} />
                    <span className="hidden sm:inline-block">{isShareCopied ? (lang === 'ru' ? 'Ссылка скопирована' : 'Link copied') : (lang === 'ru' ? 'Поделиться' : 'Share')}</span>
                </button>
                <div className="hidden md:flex items-center gap-2 text-zinc-500 font-mono text-xs bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
                    <span>DOC-ID: ASTRAL-WP-1.0</span>
                    <span className="w-1 h-1 bg-zinc-600 rounded-full"></span>
                    <span>PUBLIC</span>
                </div>
            </div>
          </nav>
      </div>

      <div className="max-w-4xl mx-auto pt-24 sm:pt-32 pb-16 sm:pb-24 px-4 sm:px-6 md:px-12 relative z-10">
          
          {/* Scientific Header */}
          <div className="mb-10 sm:mb-16 border-b border-white/10 pb-8 sm:pb-12 animate-in fade-in slide-in-from-bottom-8 duration-1000 mt-[-2vh]">
              <div className="flex flex-col gap-3 sm:gap-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 backdrop-blur-sm text-[10px] sm:text-xs font-medium text-indigo-300 w-fit mb-2">
                      <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500"></span>
                      </span>
                      TECHNICAL SPECIFICATION
                  </div>
                  <h1 className="text-4xl sm:text-5xl md:text-7xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-zinc-300 mb-1 sm:mb-2 leading-tight">
                      {t.about.title}
                  </h1>
                  <h2 className="text-lg sm:text-xl md:text-2xl text-zinc-400 font-light font-serif italic">
                      {t.about.subtitle}
                  </h2>
              </div>
          </div>

          {/* Abstract */}
          <div className="mb-10 sm:mb-16 bg-gradient-to-br from-zinc-900/80 to-black p-6 sm:p-10 rounded-2xl sm:rounded-[2rem] border border-white/10 border-l-4 border-l-indigo-500 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none"></div>
              <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-widest mb-4 sm:mb-6 flex items-center gap-2 relative z-10">
                  <FileText size={18} className="text-indigo-500" />
                  {t.about.abstract_title}
              </h3>
              <p className="text-zinc-300 leading-relaxed font-serif text-base sm:text-xl relative z-10 font-light">
                  {t.about.abstract_text}
              </p>
          </div>

          {/* Table of Contents */}
          <div className="mb-12 sm:mb-20 bg-gradient-to-br from-zinc-900/50 to-black p-5 sm:p-8 md:p-10 rounded-2xl sm:rounded-[2rem] border border-white/5 shadow-xl">
              <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-widest mb-3 sm:mb-4 flex items-center gap-2">
                  <Share2 size={16} className="text-cyan-400" />
                  {t.about.toc_title}
              </h3>
              <p className="text-zinc-400 leading-relaxed text-xs sm:text-sm md:text-base mb-6 sm:mb-8 font-light">
                  {t.about.toc_text}
              </p>
              <div className="relative mb-6">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                  <input
                      value={tocQuery}
                      onChange={(e) => setTocQuery(e.target.value)}
                      placeholder={t.about.toc_search_placeholder}
                      className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-xs md:text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all"
                  />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
                  {filteredTocItems.length > 0 ? (
                      filteredTocItems.map((item) => (
                          <button
                              key={item.id}
                              onClick={() => scrollToSection(item.id)}
                              className={`text-left font-mono text-[11px] md:text-xs rounded-xl px-4 py-3 transition-all duration-300 ${
                                  activeSection === item.id
                                      ? 'text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)] scale-[1.02]'
                                      : 'text-zinc-400 bg-black/20 border border-white/5 hover:border-white/20 hover:text-white hover:bg-white/5'
                              }`}
                          >
                              {item.label}
                          </button>
                      ))
                  ) : (
                      <div className="md:col-span-2 text-xs text-zinc-500 border border-dashed border-white/15 rounded-xl px-4 py-6 text-center bg-black/20">
                          {t.about.toc_empty}
                      </div>
                  )}
              </div>
          </div>

          {/* CONTENT COLUMNS */}
          <div className="grid grid-cols-1 gap-16">
              
              {/* Section 1: Topology */}
              <section id="section-1" className="scroll-mt-32">
                  <h3 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 font-mono border-b border-white/5 pb-3 sm:pb-4 tracking-tight">
                      {t.about.section_1_title}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-12 mb-8 sm:mb-12">
                       <p className="text-zinc-400 leading-relaxed text-sm sm:text-base md:text-lg text-justify font-light">
                           {t.about.section_1_text}
                       </p>
                       <div className="bg-gradient-to-br from-zinc-900/50 to-black rounded-2xl border border-white/5 p-6 sm:p-8 flex flex-col items-center justify-center gap-6 shadow-lg relative overflow-hidden group">
                           <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                           {/* Simplified Visual Comparison */}
                           <div className="flex gap-8 sm:gap-12 w-full justify-center relative z-10">
                               <div className="flex flex-col items-center gap-4">
                                   <div className="relative w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center">
                                       {/* Star Topology */}
                                       <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 bg-red-500 rounded-sm z-10 shadow-[0_0_15px_rgba(239,68,68,0.5)]"></div>
                                       {[0,72,144,216,288].map(d => (
                                           <div key={d} className="absolute w-full h-full" style={{transform: `rotate(${d}deg)`}}>
                                               <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 sm:w-2.5 sm:h-2.5 bg-zinc-600 rounded-full"></div>
                                               <div className="absolute top-2 sm:top-2.5 left-1/2 -translate-x-1/2 w-[2px] h-[45%] bg-zinc-700/50"></div>
                                           </div>
                                       ))}
                                   </div>
                                   <span className="text-[10px] sm:text-xs text-zinc-500 font-mono text-center tracking-wider">{t.about.diagram_central}</span>
                               </div>

                               <div className="w-[1px] bg-white/10 h-32 sm:h-36"></div>

                               <div className="flex flex-col items-center gap-4">
                                   <div className="relative w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center">
                                       {/* Mesh Topology */}
                                        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-50 drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]">
                                           <polygon points="50,10 90,40 75,90 25,90 10,40" fill="none" stroke="#22c55e" strokeWidth="1" />
                                           <line x1="50" y1="10" x2="75" y2="90" stroke="#22c55e" strokeWidth="1" />
                                           <line x1="50" y1="10" x2="25" y2="90" stroke="#22c55e" strokeWidth="1" />
                                           <line x1="90" y1="40" x2="25" y2="90" stroke="#22c55e" strokeWidth="1" />
                                           <line x1="10" y1="40" x2="75" y2="90" stroke="#22c55e" strokeWidth="1" />
                                           <line x1="90" y1="40" x2="10" y2="40" stroke="#22c55e" strokeWidth="1" />
                                        </svg>
                                       {[0,72,144,216,288].map(d => (
                                           <div key={d} className="absolute w-full h-full" style={{transform: `rotate(${d}deg)`}}>
                                               <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 sm:w-2.5 sm:h-2.5 bg-green-500 rounded-full shadow-[0_0_10px_#22c55e]"></div>
                                           </div>
                                       ))}
                                   </div>
                                   <span className="text-[10px] sm:text-xs text-zinc-500 font-mono text-center tracking-wider">{t.about.diagram_mesh}</span>
                               </div>
                           </div>
                       </div>
                  </div>
              </section>

               {/* Section 2: Signaling */}
               <section id="section-2" className="scroll-mt-32">
                  <h3 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 font-mono border-b border-white/5 pb-3 sm:pb-4 tracking-tight">
                      {t.about.section_2_title}
                  </h3>
                  <div className="prose prose-invert max-w-none">
                      <p className="text-zinc-400 leading-relaxed text-sm sm:text-base md:text-lg text-justify mb-6 sm:mb-8 font-light">
                           {t.about.section_2_text}
                      </p>
                      <div className="bg-black/50 border border-white/5 p-5 sm:p-6 rounded-2xl font-mono text-xs sm:text-sm text-green-400/90 overflow-x-auto shadow-inner leading-loose">
                          {`// Simplified Handshake Flow
Client A -> Signaling -> Client B: { type: "offer", sdp: "..." }
Client B -> Signaling -> Client A: { type: "answer", sdp: "..." }
Client A -> Signaling -> Client B: { type: "candidate", candidate: "..." }
[Signaling Server Disconnects]
Client A <==== Encrypted P2P Stream ====> Client B`}
                      </div>
                  </div>
              </section>

              {/* Section 3: Security */}
              <section id="section-3" className="scroll-mt-32">
                  <h3 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 font-mono border-b border-white/5 pb-3 sm:pb-4 flex items-center gap-3 tracking-tight">
                      {t.about.section_3_title}
                      <Lock size={24} className="text-green-500 sm:w-7 sm:h-7 drop-shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                  </h3>
                   <div className="flex flex-col md:flex-row gap-8 sm:gap-12 items-center">
                        <div className="flex-1">
                             <p className="text-zinc-400 leading-relaxed text-sm sm:text-base md:text-lg text-justify font-light">
                                {t.about.section_3_text}
                            </p>
                        </div>
                        <div className="w-full md:w-56 flex flex-col gap-3">
                             <div className="bg-gradient-to-r from-zinc-900/80 to-zinc-900 border border-zinc-800 p-4 rounded-xl text-center shadow-lg hover:border-zinc-700 transition-colors">
                                 <div className="text-[10px] sm:text-xs font-mono text-zinc-500 mb-1.5 tracking-widest">KEY EXCHANGE</div>
                                 <div className="font-bold text-white text-sm sm:text-base tracking-wide">DTLS 1.2</div>
                             </div>
                             <div className="bg-gradient-to-r from-zinc-900/80 to-zinc-900 border border-zinc-800 p-4 rounded-xl text-center shadow-lg hover:border-zinc-700 transition-colors">
                                 <div className="text-[10px] sm:text-xs font-mono text-zinc-500 mb-1.5 tracking-widest">CIPHER SUITE</div>
                                 <div className="font-bold text-white text-sm sm:text-base tracking-wide">AES-128-GCM</div>
                             </div>
                             <div className="bg-gradient-to-r from-zinc-900/80 to-zinc-900 border border-zinc-800 p-4 rounded-xl text-center shadow-lg hover:border-zinc-700 transition-colors">
                                 <div className="text-[10px] sm:text-xs font-mono text-zinc-500 mb-1.5 tracking-widest">MEDIA</div>
                                 <div className="font-bold text-white text-sm sm:text-base tracking-wide">SRTP</div>
                             </div>
                        </div>
                   </div>
              </section>

               {/* Section 4: NAT */}
               <section id="section-4" className="scroll-mt-32">
                  <h3 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 font-mono border-b border-white/5 pb-3 sm:pb-4 tracking-tight">
                      {t.about.section_4_title}
                  </h3>
                  <p className="text-zinc-400 leading-relaxed text-sm sm:text-base md:text-lg text-justify font-light">
                      {t.about.section_4_text}
                  </p>
              </section>

              {/* Section 5: Scalability */}
              <section id="section-5" className="scroll-mt-32">
                  <h3 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 font-mono border-b border-white/5 pb-3 sm:pb-4 flex items-center gap-3 tracking-tight">
                      {t.about.section_5_title}
                      <Activity size={24} className="text-indigo-400 sm:w-7 sm:h-7" />
                  </h3>
                  <p className="text-zinc-400 leading-relaxed text-sm sm:text-base md:text-lg text-justify mb-6 sm:mb-8 font-light">
                      {t.about.section_5_text}
                  </p>
                  <div className="space-y-4 sm:space-y-6">
                      <div className="bg-gradient-to-r from-zinc-900/50 to-black border border-white/5 rounded-2xl p-5 sm:p-6 shadow-lg">
                          <p className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-widest font-mono mb-2 sm:mb-3">{t.about.section_5_formula_label}</p>
                          <code className="text-sm sm:text-base text-indigo-300 font-mono tracking-wider">{t.about.section_5_formula}</code>
                      </div>
                      <div className="bg-gradient-to-r from-zinc-900/50 to-black border border-white/5 rounded-2xl p-5 sm:p-6 shadow-lg">
                          <p className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-widest font-mono mb-4 sm:mb-6 flex items-center gap-2">
                              <Cpu size={14} className="text-zinc-400" />
                              {t.about.scaling_table_title}
                          </p>
                          <div className="overflow-x-auto custom-scrollbar pb-2">
                              <table className="w-full text-left text-xs sm:text-sm">
                                  <thead className="text-zinc-500">
                                      <tr className="border-b border-white/10">
                                          <th className="py-3 pr-4 font-mono font-medium">{t.about.scaling_col_users}</th>
                                          <th className="py-3 pr-4 font-mono font-medium">{t.about.scaling_col_connections}</th>
                                          <th className="py-3 pr-4 font-mono font-medium">{t.about.scaling_col_upload}</th>
                                          <th className="py-3 pr-4 font-mono font-medium">{t.about.scaling_col_cpu}</th>
                                          <th className="py-3 font-mono font-medium">{t.about.scaling_col_profile}</th>
                                      </tr>
                                  </thead>
                                  <tbody>
                                      {scalingRows.map((row) => (
                                          <tr key={row.users} className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02] transition-colors">
                                              <td className="py-3 pr-4 text-white font-mono font-bold">{row.users}</td>
                                              <td className="py-3 pr-4 text-indigo-300 font-mono">{row.connections}</td>
                                              <td className="py-3 pr-4 text-zinc-300 font-mono">{row.upload}</td>
                                              <td className="py-3 pr-4 text-zinc-300">{row.cpu}</td>
                                              <td className="py-3 text-zinc-400">{row.profile}</td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                          <p className="mt-4 sm:mt-5 text-zinc-500 text-xs font-mono">{t.about.section_5_note}</p>
                      </div>
                  </div>
              </section>

              {/* Section 6: Reliability */}
              <section id="section-6" className="scroll-mt-32">
                  <h3 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 font-mono border-b border-white/5 pb-3 sm:pb-4 flex items-center gap-3 tracking-tight">
                      {t.about.section_6_title}
                      <Shield size={24} className="text-emerald-400 sm:w-7 sm:h-7" />
                  </h3>
                  <p className="text-zinc-400 leading-relaxed text-sm sm:text-base md:text-lg text-justify mb-6 sm:mb-8 font-light">
                      {t.about.section_6_text}
                  </p>
                  <ol className="space-y-3 sm:space-y-4">
                      {resilienceSteps.map((step, index) => (
                          <li key={step} className="bg-gradient-to-r from-zinc-900/50 to-black border border-white/5 rounded-2xl p-4 sm:p-5 flex gap-4 sm:gap-5 hover:border-white/10 transition-colors">
                              <span className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs sm:text-sm font-mono flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
                                  {index + 1}
                              </span>
                              <p className="text-sm sm:text-base text-zinc-300 leading-relaxed font-light mt-0.5">{step}</p>
                          </li>
                      ))}
                  </ol>
              </section>

              {/* Section 7: Operations */}
              <section id="section-7" className="scroll-mt-32">
                  <h3 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 font-mono border-b border-white/5 pb-3 sm:pb-4 flex items-center gap-3 tracking-tight">
                      {t.about.section_7_title}
                      <Server size={24} className="text-cyan-400 sm:w-7 sm:h-7" />
                  </h3>
                  <p className="text-zinc-400 leading-relaxed text-sm sm:text-base md:text-lg text-justify mb-6 sm:mb-8 font-light">
                      {t.about.section_7_text}
                  </p>
                  <ul className="space-y-3 sm:space-y-4 mb-6 sm:mb-8">
                      {operatorChecklist.map((item) => (
                          <li key={item} className="bg-gradient-to-r from-zinc-900/50 to-black border border-white/5 rounded-2xl p-4 sm:p-5 text-sm sm:text-base text-zinc-300 leading-relaxed font-light flex gap-4 hover:border-white/10 transition-colors">
                              <span className="text-cyan-400 font-mono mt-0.5">[x]</span>
                              <span>{item}</span>
                          </li>
                      ))}
                  </ul>
                  <div className="bg-black/50 border border-white/5 p-5 sm:p-6 rounded-2xl font-mono text-xs sm:text-sm text-cyan-300/80 overflow-x-auto shadow-inner leading-loose">
{`# Example minimal runtime config
SIGNALING_PORT=8080
CORS_ORIGIN=https://your-domain.tld
TURN_URL=turn:turn.your-domain.tld:3478
TURN_USERNAME=astral
TURN_PASSWORD=change-me`}
                  </div>
              </section>

              {/* Section 8: Limits */}
              <section id="section-8" className="scroll-mt-32">
                  <h3 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 font-mono border-b border-white/5 pb-3 sm:pb-4 flex items-center gap-3 tracking-tight">
                      {t.about.section_8_title}
                      <Globe size={24} className="text-amber-400 sm:w-7 sm:h-7" />
                  </h3>
                  <p className="text-zinc-400 leading-relaxed text-sm sm:text-base md:text-lg text-justify mb-6 sm:mb-8 font-light">
                      {t.about.section_8_text}
                  </p>
                  <ul className="space-y-3 sm:space-y-4">
                      {limitations.map((item) => (
                          <li key={item} className="bg-gradient-to-r from-zinc-900/50 to-black border border-white/5 rounded-2xl p-4 sm:p-5 text-sm sm:text-base text-zinc-300 leading-relaxed font-light flex gap-4 hover:border-white/10 transition-colors">
                              <span className="text-amber-400 font-mono mt-0.5">-</span>
                              <span>{item}</span>
                          </li>
                      ))}
                  </ul>
              </section>

              {/* Section 9: FAQ */}
              <section id="section-9" className="scroll-mt-32">
                  <h3 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 font-mono border-b border-white/5 pb-3 sm:pb-4 flex items-center gap-3 tracking-tight">
                      {t.about.faq_title}
                      <Share2 size={24} className="text-violet-400 sm:w-7 sm:h-7" />
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                      {faq.map((item, index) => (
                          <article key={item.q} className="bg-gradient-to-br from-zinc-900/80 to-black border border-white/5 rounded-2xl p-5 sm:p-6 hover:border-white/10 transition-colors shadow-lg">
                              <button
                                  onClick={() => setOpenFaqIndex((current) => (current === index ? null : index))}
                                  className="w-full text-left flex items-start justify-between gap-4 group"
                                  aria-expanded={openFaqIndex === index}
                                  aria-label={openFaqIndex === index ? t.about.faq_toggle_hide : t.about.faq_toggle_show}
                              >
                                  <h4 className="text-white font-semibold text-sm sm:text-base leading-relaxed group-hover:text-indigo-300 transition-colors">{item.q}</h4>
                                  <span className="text-violet-400 font-mono text-xs sm:text-sm mt-1 shrink-0 bg-violet-500/10 px-2 py-1 rounded-md group-hover:bg-violet-500/20 transition-colors">
                                      {openFaqIndex === index ? '[-]' : '[+]'}
                                  </span>
                              </button>
                              <div className={`grid transition-all duration-300 ${openFaqIndex === index ? 'grid-rows-[1fr] mt-4' : 'grid-rows-[0fr]'}`}>
                                  <p className="overflow-hidden text-zinc-400 text-sm sm:text-base leading-relaxed font-light">{item.a}</p>
                              </div>
                          </article>
                      ))}
                  </div>
              </section>

              {/* Section 10: Lifecycle */}
              <section id="section-10" className="scroll-mt-32">
                  <h3 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 font-mono border-b border-white/5 pb-3 sm:pb-4 flex items-center gap-3 tracking-tight">
                      {t.about.section_10_title}
                      <Activity size={24} className="text-teal-400 sm:w-7 sm:h-7" />
                  </h3>
                  <p className="text-zinc-400 leading-relaxed text-sm sm:text-base md:text-lg text-justify mb-6 sm:mb-8 font-light">
                      {t.about.section_10_text}
                  </p>
                  <ol className="space-y-3 sm:space-y-4">
                      {lifecycleSteps.map((step, index) => (
                          <li key={step} className="bg-gradient-to-r from-zinc-900/50 to-black border border-white/5 rounded-2xl p-4 sm:p-5 flex gap-4 sm:gap-5 hover:border-white/10 transition-colors">
                              <span className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-teal-500/10 border border-teal-500/20 text-xs sm:text-sm font-mono flex items-center justify-center text-teal-400 shrink-0 shadow-inner">
                                  {index + 1}
                              </span>
                              <p className="text-sm sm:text-base text-zinc-300 leading-relaxed font-light mt-0.5">{step}</p>
                          </li>
                      ))}
                  </ol>
              </section>

              {/* Section 11: Threat Model */}
              <section id="section-11" className="scroll-mt-32">
                  <h3 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 font-mono border-b border-white/5 pb-3 sm:pb-4 flex items-center gap-3 tracking-tight">
                      {t.about.section_11_title}
                      <Lock size={24} className="text-rose-400 sm:w-7 sm:h-7" />
                  </h3>
                  <p className="text-zinc-400 leading-relaxed text-sm sm:text-base md:text-lg text-justify mb-6 sm:mb-8 font-light">
                      {t.about.section_11_text}
                  </p>
                  <div className="bg-gradient-to-r from-zinc-900/50 to-black border border-white/5 rounded-2xl p-5 sm:p-6 shadow-lg overflow-x-auto custom-scrollbar">
                      <table className="w-full text-left text-xs sm:text-sm">
                          <thead className="text-zinc-500">
                              <tr className="border-b border-white/10">
                                  <th className="py-3 pr-4 font-mono font-medium">{t.about.threat_col_1}</th>
                                  <th className="py-3 pr-4 font-mono font-medium">{t.about.threat_col_2}</th>
                                  <th className="py-3 font-mono font-medium">{t.about.threat_col_3}</th>
                              </tr>
                          </thead>
                          <tbody>
                              {threatRows.map((row) => (
                                  <tr key={row.threat} className="border-b border-white/5 last:border-b-0 align-top hover:bg-white/[0.02] transition-colors">
                                      <td className="py-4 pr-4 text-white font-medium">{row.threat}</td>
                                      <td className="py-4 pr-4 text-zinc-400 leading-relaxed">{row.path}</td>
                                      <td className="py-4 text-zinc-300 leading-relaxed">{row.mitigation}</td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
                  <p className="mt-4 sm:mt-5 text-zinc-500 text-xs font-mono">{t.about.section_11_note}</p>
              </section>

              {/* Section 12: Adaptation */}
              <section id="section-12" className="scroll-mt-32">
                  <h3 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 font-mono border-b border-white/5 pb-3 sm:pb-4 flex items-center gap-3 tracking-tight">
                      {t.about.section_12_title}
                      <Cpu size={24} className="text-sky-400 sm:w-7 sm:h-7" />
                  </h3>
                  <p className="text-zinc-400 leading-relaxed text-sm sm:text-base md:text-lg text-justify mb-6 sm:mb-8 font-light">
                      {t.about.section_12_text}
                  </p>
                  <ul className="space-y-3 sm:space-y-4 mb-6 sm:mb-8">
                      {adaptationChecklist.map((item) => (
                          <li key={item} className="bg-gradient-to-r from-zinc-900/50 to-black border border-white/5 rounded-2xl p-4 sm:p-5 text-sm sm:text-base text-zinc-300 leading-relaxed font-light flex gap-4 hover:border-white/10 transition-colors">
                              <span className="text-sky-400 font-mono mt-0.5">-</span>
                              <span>{item}</span>
                          </li>
                      ))}
                  </ul>
                  <div className="bg-gradient-to-r from-zinc-900/50 to-black border border-white/5 rounded-2xl p-5 sm:p-6 shadow-lg">
                      <p className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-widest font-mono mb-2 sm:mb-3">{t.about.section_12_formula_label}</p>
                      <code className="text-xs md:text-sm text-sky-300 font-mono break-words">{t.about.section_12_formula}</code>
                  </div>
              </section>

              {/* Section 13: Troubleshooting */}
              <section id="section-13" className="scroll-mt-32">
                  <h3 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 font-mono border-b border-white/5 pb-3 sm:pb-4 flex items-center gap-3 tracking-tight">
                      {t.about.section_13_title}
                      <Server size={24} className="text-orange-400 sm:w-7 sm:h-7" />
                  </h3>
                  <p className="text-zinc-400 leading-relaxed text-sm sm:text-base md:text-lg text-justify mb-6 sm:mb-8 font-light">
                      {t.about.section_13_text}
                  </p>
                  <div className="bg-gradient-to-r from-zinc-900/50 to-black border border-white/5 rounded-2xl p-5 sm:p-6 shadow-lg overflow-x-auto custom-scrollbar">
                      <table className="w-full text-left text-xs sm:text-sm">
                          <thead className="text-zinc-500">
                              <tr className="border-b border-white/10">
                                  <th className="py-3 pr-4 font-mono font-medium">{t.about.troubles_col_1}</th>
                                  <th className="py-3 pr-4 font-mono font-medium">{t.about.troubles_col_2}</th>
                                  <th className="py-3 font-mono font-medium">{t.about.troubles_col_3}</th>
                              </tr>
                          </thead>
                          <tbody>
                              {troubleshootingRows.map((row) => (
                                  <tr key={row.symptom} className="border-b border-white/5 last:border-b-0 align-top hover:bg-white/[0.02] transition-colors">
                                      <td className="py-4 pr-4 text-white font-medium">{row.symptom}</td>
                                      <td className="py-4 pr-4 text-zinc-400 leading-relaxed">{row.cause}</td>
                                      <td className="py-4 text-zinc-300 leading-relaxed">{row.action}</td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
                  <p className="mt-4 sm:mt-5 text-zinc-500 text-xs font-mono">{t.about.section_13_note}</p>
              </section>

              {/* Section 14: Runbook & SLO */}
              <section id="section-14" className="scroll-mt-32">
                  <h3 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 font-mono border-b border-white/5 pb-3 sm:pb-4 flex items-center gap-3 tracking-tight">
                      {t.about.section_14_title}
                      <Shield size={24} className="text-lime-400 sm:w-7 sm:h-7" />
                  </h3>
                  <p className="text-zinc-400 leading-relaxed text-sm sm:text-base md:text-lg text-justify mb-6 sm:mb-8 font-light">
                      {t.about.section_14_text}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                      <article className="bg-gradient-to-br from-zinc-900/80 to-black border border-white/5 rounded-2xl p-6 sm:p-8 hover:border-white/10 transition-colors shadow-lg">
                          <h4 className="text-white font-semibold mb-4 sm:mb-5 text-base md:text-lg tracking-wide">{t.about.section_14_slo_title}</h4>
                          <ul className="space-y-3 sm:space-y-4">
                              {sloTargets.map((item) => (
                                  <li key={item} className="text-zinc-300 text-sm sm:text-base leading-relaxed font-light flex gap-3">
                                      <span className="text-lime-400 font-mono mt-0.5">{'>'}</span>
                                      <span>{item}</span>
                                  </li>
                              ))}
                          </ul>
                      </article>
                      <article className="bg-gradient-to-br from-zinc-900/80 to-black border border-white/5 rounded-2xl p-6 sm:p-8 hover:border-white/10 transition-colors shadow-lg">
                          <h4 className="text-white font-semibold mb-4 sm:mb-5 text-base md:text-lg tracking-wide">{t.about.section_14_ops_title}</h4>
                          <ul className="space-y-3 sm:space-y-4">
                              {runbookChecklist.map((item) => (
                                  <li key={item} className="text-zinc-300 text-sm sm:text-base leading-relaxed font-light flex gap-3">
                                      <span className="text-lime-400 font-mono mt-0.5">{'>'}</span>
                                      <span>{item}</span>
                                  </li>
                              ))}
                          </ul>
                      </article>
                  </div>
              </section>

              {/* Section 15: Glossary */}
              <section id="section-15" className="scroll-mt-32">
                  <h3 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 font-mono border-b border-white/5 pb-3 sm:pb-4 flex items-center gap-3 tracking-tight">
                      {t.about.section_15_title}
                      <FileText size={24} className="text-fuchsia-400 sm:w-7 sm:h-7" />
                  </h3>
                  <p className="text-zinc-400 leading-relaxed text-sm sm:text-base md:text-lg text-justify mb-6 sm:mb-8 font-light">
                      {t.about.section_15_text}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {glossary.map((entry) => (
                          <article key={entry.term} className="bg-[#0a0a0a] border border-white/5 rounded-lg p-5">
                              <h4 className="text-white font-semibold mb-2 text-sm md:text-base">{entry.term}</h4>
                              <p className="text-zinc-400 text-sm leading-6">{entry.desc}</p>
                          </article>
                      ))}
                  </div>
              </section>

              {/* Section 16: Architectural Conclusion */}
              <section id="section-16" className="scroll-mt-32">
                  <h3 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 font-mono border-b border-white/5 pb-3 sm:pb-4 flex items-center gap-3 tracking-tight">
                      {t.about.section_16_title}
                      <Activity size={24} className="text-violet-400 sm:w-7 sm:h-7" />
                  </h3>
                  <p className="text-zinc-400 leading-relaxed text-sm sm:text-base md:text-lg text-justify mb-6 sm:mb-8 font-light">
                      {t.about.section_16_text}
                  </p>
                  <ul className="space-y-3 sm:space-y-4">
                      <li className="bg-gradient-to-r from-zinc-900/50 to-black border border-white/5 rounded-2xl p-4 sm:p-5 text-sm sm:text-base text-zinc-300 leading-relaxed font-light flex gap-4 hover:border-white/10 transition-colors">
                          <span className="text-violet-400 font-mono mt-0.5">-</span>
                          <span>{t.about.section_16_point_1}</span>
                      </li>
                      <li className="bg-gradient-to-r from-zinc-900/50 to-black border border-white/5 rounded-2xl p-4 sm:p-5 text-sm sm:text-base text-zinc-300 leading-relaxed font-light flex gap-4 hover:border-white/10 transition-colors">
                          <span className="text-violet-400 font-mono mt-0.5">-</span>
                          <span>{t.about.section_16_point_2}</span>
                      </li>
                      <li className="bg-gradient-to-r from-zinc-900/50 to-black border border-white/5 rounded-2xl p-4 sm:p-5 text-sm sm:text-base text-zinc-300 leading-relaxed font-light flex gap-4 hover:border-white/10 transition-colors">
                          <span className="text-violet-400 font-mono mt-0.5">-</span>
                          <span>{t.about.section_16_point_3}</span>
                      </li>
                      <li className="bg-gradient-to-r from-zinc-900/50 to-black border border-white/5 rounded-2xl p-4 sm:p-5 text-sm sm:text-base text-zinc-300 leading-relaxed font-light flex gap-4 hover:border-white/10 transition-colors">
                          <span className="text-violet-400 font-mono mt-0.5">-</span>
                          <span>{t.about.section_16_point_4}</span>
                      </li>
                  </ul>
              </section>

              {/* Section 17: Governance */}
              <section id="section-17" className="scroll-mt-32">
                  <h3 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 font-mono border-b border-white/5 pb-3 sm:pb-4 flex items-center gap-3 tracking-tight">
                      {t.about.section_17_title}
                      <Shield size={24} className="text-sky-400 sm:w-7 sm:h-7" />
                  </h3>
                  <p className="text-zinc-400 leading-relaxed text-sm sm:text-base md:text-lg text-justify mb-6 sm:mb-8 font-light">
                      {t.about.section_17_text}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                      <article className="bg-gradient-to-br from-zinc-900/80 to-black border border-white/5 rounded-2xl p-6 sm:p-8 hover:border-white/10 transition-colors shadow-lg">
                          <h4 className="text-white font-semibold mb-4 sm:mb-5 text-base md:text-lg tracking-wide">{t.about.section_17_gov_title}</h4>
                          <ul className="space-y-3 sm:space-y-4">
                              {governancePrinciples.map((item) => (
                                  <li key={item} className="text-zinc-300 text-sm sm:text-base leading-relaxed font-light flex gap-3">
                                      <span className="text-sky-400 font-mono mt-0.5">{'>'}</span>
                                      <span>{item}</span>
                                  </li>
                              ))}
                          </ul>
                      </article>
                      <article className="bg-gradient-to-br from-zinc-900/80 to-black border border-white/5 rounded-2xl p-6 sm:p-8 hover:border-white/10 transition-colors shadow-lg">
                          <h4 className="text-white font-semibold mb-4 sm:mb-5 text-base md:text-lg tracking-wide">{t.about.section_17_release_title}</h4>
                          <ul className="space-y-3 sm:space-y-4">
                              {releaseChannels.map((item) => (
                                  <li key={item} className="text-zinc-300 text-sm sm:text-base leading-relaxed font-light flex gap-3">
                                      <span className="text-sky-400 font-mono mt-0.5">{'>'}</span>
                                      <span>{item}</span>
                                  </li>
                              ))}
                          </ul>
                      </article>
                  </div>
              </section>

              {/* Section 18: Appendices */}
              <section id="section-18" className="scroll-mt-32">
                  <h3 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 font-mono border-b border-white/5 pb-3 sm:pb-4 flex items-center gap-3 tracking-tight">
                      {t.about.section_18_title}
                      <Server size={24} className="text-emerald-400 sm:w-7 sm:h-7" />
                  </h3>
                  <p className="text-zinc-400 leading-relaxed text-sm sm:text-base md:text-lg text-justify mb-6 sm:mb-8 font-light">
                      {t.about.section_18_text}
                  </p>
                  <div className="bg-gradient-to-r from-zinc-900/50 to-black border border-white/5 rounded-2xl p-5 sm:p-6 shadow-lg overflow-x-auto custom-scrollbar">
                      <table className="w-full text-left text-xs sm:text-sm">
                          <thead className="text-zinc-500">
                              <tr className="border-b border-white/10">
                                  <th className="py-3 pr-4 font-mono font-medium">{t.about.appendix_col_1}</th>
                                  <th className="py-3 pr-4 font-mono font-medium">{t.about.appendix_col_2}</th>
                                  <th className="py-3 font-mono font-medium">{t.about.appendix_col_3}</th>
                              </tr>
                          </thead>
                          <tbody>
                              {appendixRows.map((row) => (
                                  <tr key={row.scenario} className="border-b border-white/5 last:border-b-0 align-top hover:bg-white/[0.02] transition-colors">
                                      <td className="py-4 pr-4 text-white font-medium">{row.scenario}</td>
                                      <td className="py-4 pr-4 text-zinc-400 leading-relaxed">{row.indicator}</td>
                                      <td className="py-4 text-zinc-300 leading-relaxed">{row.action}</td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
                  <p className="mt-4 sm:mt-5 text-zinc-500 text-xs font-mono">{t.about.section_18_note}</p>
              </section>

              {/* Final Closing */}
              <section className="rounded-3xl sm:rounded-[3rem] border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-cyan-500/5 to-black p-8 sm:p-12 md:p-16 relative overflow-hidden shadow-[0_0_40px_rgba(99,102,241,0.1)]">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 opacity-50"></div>
                  <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-6 sm:mb-8 font-mono flex items-center gap-3 sm:gap-4 tracking-tight">
                      {t.about.closing_title}
                      <Globe size={28} className="text-cyan-400 sm:w-8 sm:h-8 animate-pulse-slow" />
                  </h3>
                  <p className="text-zinc-300 leading-relaxed text-sm sm:text-base md:text-lg text-justify mb-6 sm:mb-8 font-light">
                      {t.about.closing_text}
                  </p>
                  <ul className="space-y-3 sm:space-y-4">
                      {closingChecklist.map((item) => (
                          <li key={item} className="text-zinc-200 text-sm sm:text-base md:text-lg leading-relaxed font-light flex gap-3 sm:gap-4 bg-black/20 p-4 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                              <span className="text-cyan-400 font-mono mt-0.5">*</span>
                              <span>{item}</span>
                          </li>
                      ))}
                  </ul>
              </section>

          </div>

          <div className="mt-20 sm:mt-32 pt-10 sm:pt-12 border-t border-white/10 flex flex-col md:flex-row justify-between items-center text-xs sm:text-sm font-mono text-zinc-600 gap-6 md:gap-0 relative z-10">
              <div className="text-center md:text-left">
                  <p className="mb-1">ASTRAL PROTOCOL SPECIFICATION</p>
                  <p>© 2026</p>
              </div>
              <div className="flex gap-6 sm:gap-8 bg-zinc-900/50 px-6 py-3 rounded-full border border-white/5">
                  <span className="flex items-center gap-2"><Lock size={12} className="text-zinc-500" /> SHA-256: 8A2F...91B2</span>
                  <span className="flex items-center gap-2"><Server size={12} className="text-zinc-500" /> VER: 1.0.4-STABLE</span>
              </div>
          </div>

          {showBackToTop && (
              <button
                  onClick={handleBackToTop}
                  className="fixed bottom-6 sm:bottom-8 right-6 sm:right-8 z-[70] bg-black/80 backdrop-blur-md border border-white/20 text-zinc-300 rounded-full px-4 sm:px-5 py-3 sm:py-3.5 flex items-center gap-2 text-xs sm:text-sm font-mono hover:border-cyan-400/60 hover:text-white hover:shadow-[0_0_20px_rgba(6,182,212,0.2)] hover:-translate-y-1 transition-all active:scale-95 group"
              >
                  <ChevronUp size={16} className="group-hover:text-cyan-400 transition-colors" />
                  <span className="hidden sm:inline-block">{t.about.back_to_top}</span>
              </button>
          )}
      </div>
    </div>
  );
};

export default AboutPage;
