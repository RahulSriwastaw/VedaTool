import React from "react";
import { motion } from "motion/react";
import { FileText, MessageSquare, Zap, Target, Layout, ShieldCheck, ArrowRight, Video } from "lucide-react";
import { ToolCard } from "./ui/ToolCard";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { useNavigate } from "react-router-dom";

interface Props {
  onStart: () => void;
}

const LandingPage: React.FC<Props> = ({ onStart }) => {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative pt-[120px] pb-20 px-4 md:px-6 flex flex-col items-center justify-center text-center overflow-hidden min-h-[70vh]">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[var(--brand-primary)]/5 rounded-full blur-[120px] pointer-events-none" />
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 max-w-4xl mx-auto"
        >
          <div className="inline-flex py-1 px-3 mb-6 rounded-full bg-[var(--bg-card)] border border-[var(--border-default)] shadow-sm">
            <span className="text-[11px] font-bold text-[var(--brand-primary)] uppercase tracking-wide">
              ✦ VEDATOOL INTELLIGENT SUITE
            </span>
          </div>
          
          <h1 className="text-[var(--text-4xl)] md:text-[56px] lg:text-[64px] font-bold text-[var(--text-primary)] leading-[1.1] tracking-tight mb-6">
            Unleash the Power of <br />
            <span className="text-[var(--brand-primary)]">Intelligent Automation</span>
          </h1>
          
          <p className="text-[var(--text-lg)] text-[var(--text-secondary)] max-w-[520px] mx-auto mb-10 leading-relaxed">
            The ultimate suite for PDF conversions, document OCR, exam digitizing, and AI-driven growth tools for India.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Button size="lg" variant="primary" onClick={onStart} className="w-full sm:w-auto uppercase tracking-wide text-white">
              Get Started Free
            </Button>
            <Button size="lg" variant="secondary" onClick={() => document.getElementById("tools")?.scrollIntoView({ behavior: "smooth" })} className="w-full sm:w-auto uppercase tracking-wide text-black">
              Explore Tools
            </Button>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            {[
              { icon: <FileText size={16} />, title: "PDF to Text" },
              { icon: <MessageSquare size={16} />, title: "Veda AI Assistant" },
              { icon: <Zap size={16} />, title: "Lightning Fast" },
            ].map((pill, i) => (
              <div key={i} className="flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--border-default)] px-4 py-2 rounded-full shadow-[var(--shadow-card)]">
                <span className="text-[var(--brand-primary)]">{pill.icon}</span>
                <span className="text-[13px] font-medium text-[var(--text-primary)]">{pill.title}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Stats Row */}
      <section className="bg-[var(--bg-surface)] border-y border-[var(--border-default)] py-12">
        <div className="max-w-[1200px] mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 divide-x divide-[var(--border-default)]">
          {[
            { value: "20K+", label: "Processed Docs" },
            { value: "6", label: "Specialized AI Tools" },
            { value: "99.9%", label: "Conversion Accuracy" },
            { value: "₹0", label: "Free to Start" },
          ].map((stat, i) => (
            <div key={i} className={`flex flex-col items-center text-center ${i % 2 !== 0 ? 'border-none md:border-solid lg:border-solid xl:border-solid 2xl:border-solid' : 'border-none'}`}>
              <span className="text-3xl font-bold text-[var(--text-primary)] mb-1">{stat.value}</span>
              <span className="text-[var(--text-sm)] text-[var(--text-secondary)] font-medium uppercase tracking-wider">{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Tools Showcase Grid */}
      <section id="tools" className="py-20 px-4 md:px-6 bg-[var(--bg-page)]">
        <div className="max-w-[1300px] mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] mb-2 tracking-tight">Select Your AI Tool</h2>
            <p className="text-[13px] text-[var(--text-secondary)] max-w-xl mx-auto">Choose an elite AI productivity tool below to instantly transform your creative workspace actions.</p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5 sm:gap-3">
            <ToolCard icon={<FileText size={16} />} title="PDF to DOCX" description="AI formatting conversion preserving complex documents." badge="NEW" onClick={() => navigate('/tools/pdf-to-word-converter')} iconBgColor="#6366F1" />
            <ToolCard icon={<Target size={16} />} title="PDF to Text (OCR)" description="High-accuracy layout-aware scan parsing." badge="PRO" onClick={() => navigate('/tools/pdf-to-text-ocr')} iconBgColor="#4F46E5" />
            <ToolCard icon={<MessageSquare size={16} />} title="Veda AI Chat" description="Talk to Gemini 3.5 & analyze document files." badge="BETA" onClick={() => navigate('/tools/ai-chat-document-analyzer')} iconBgColor="#4B7BF5" />
            <ToolCard icon={<Video size={16} />} title="YouTube SEO" description="Generate optimized viral tags and titles." badge="NEW" onClick={() => navigate('/tools/youtube-seo-title-description-generator')} iconBgColor="#E63946" />
            <ToolCard icon={<FileText size={16} />} title="PDF Page Arranger" description="Intuitive split, list-sort, and multi-file merge." badge="NEW" onClick={() => navigate('/tools/pdf-page-arranger-merger')} iconBgColor="#7B5EA7" />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 md:px-6 bg-[var(--bg-surface)]">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-[var(--bg-card)] p-8 rounded-[var(--radius-xl)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
              <div className="w-12 h-12 bg-[var(--brand-primary-muted)] text-[var(--brand-primary)] flex items-center justify-center rounded-[var(--radius-md)] mb-6">
                 <FileText size={24} />
              </div>
              <h3 className="text-[var(--text-xl)] font-bold text-[var(--text-primary)] mb-3">Flawless Parsing</h3>
              <p className="text-[var(--text-secondary)] leading-relaxed">Unlike simple text dumpers, we preserve complex layouts, inline tables, formatting boundaries, and image attachments.</p>
            </div>
            <div className="bg-[var(--bg-card)] p-8 rounded-[var(--radius-xl)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
              <div className="w-12 h-12 bg-[var(--brand-primary-muted)] text-[var(--brand-primary)] flex items-center justify-center rounded-[var(--radius-md)] mb-6">
                 <MessageSquare size={24} />
              </div>
              <h3 className="text-[var(--text-xl)] font-bold text-[var(--text-primary)] mb-3">AI Intelligence</h3>
              <p className="text-[var(--text-secondary)] leading-relaxed">Powered by state-of-the-art vision and language models capable of extracting structured exam data intuitively.</p>
            </div>
            <div className="bg-[var(--bg-card)] p-8 rounded-[var(--radius-xl)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
              <div className="w-12 h-12 bg-[var(--brand-primary-muted)] text-[var(--brand-primary)] flex items-center justify-center rounded-[var(--radius-md)] mb-6">
                 <ShieldCheck size={24} />
              </div>
              <h3 className="text-[var(--text-xl)] font-bold text-[var(--text-primary)] mb-3">Secure & Fast</h3>
              <p className="text-[var(--text-secondary)] leading-relaxed">Your data remains private. Document pipelines are highly optimized ensuring conversions complete lightning fast.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <section className="py-24 px-4 text-center bg-[var(--bg-page)] relative overflow-hidden">
         <div className="absolute inset-0 bg-[var(--brand-primary)]/5"></div>
         <div className="relative z-10 max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-5xl font-bold text-[var(--text-primary)] mb-6 tracking-tight">Ready to automate your document tasks?</h2>
            <p className="text-[var(--text-lg)] text-[var(--text-secondary)] mb-10">Sign up and access all VedaTool productivity features immediately.</p>
            <Button size="lg" variant="primary" onClick={onStart} className="px-8 text-base">
               START FREE TODAY
               <ArrowRight size={18} className="ml-2" />
            </Button>
         </div>
      </section>
    </div>
  );
};

export default LandingPage;
