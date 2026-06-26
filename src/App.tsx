import React, { useState, useEffect } from "react";
import { Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import PdfConverter from "./components/PdfConverter";
import ExportStudio from "./components/ExportStudio";
import { PdfArranger } from "./components/PdfArranger";
import PdfToDocxConverter from "./components/PdfToDocxConverter";
import PdfWatermarkRemover from "./components/PdfWatermarkRemover/index.tsx";
import McqWorkspace from "./components/McqWorkspace";
import ErrorBoundary from "./components/ErrorBoundary";
import LandingPage from "./components/LandingPage";
import Navbar from "./components/Navbar";
import { Sidebar } from "./components/Sidebar";
import AdminPanel from "./components/AdminPanel";
import ToolSelection from "./components/ToolSelection";
import ChatApp from "./components/Chat/ChatApp";
import YoutubeSeoTool from "./components/YoutubeSeoTool";
import PricingPlans from "./components/PricingPlans";
import AnalyticsTracker from "./components/AnalyticsTracker";
import ProfileDashboard from "./components/ProfileDashboard";
import TokenNotification from "./components/TokenNotification";
import { ToastNotification } from "./components/ui/ToastNotification";
import { auth } from "./services/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { handleGoogleRedirectResult } from "./services/googleAuth";
import { motion, AnimatePresence } from "motion/react";
import AuthModal from "./components/AuthModal";
import { ToolPageHeader } from "./components/ui/ToolPageHeader";
import { FileText, Youtube, LayoutGrid, ListChecks, ArrowLeftRight, AlertTriangle, X, Trash2 } from "lucide-react";
import { useTheme } from "./hooks/useTheme";
import { SeoFooter } from "./components/SeoFooter";
import { toolsConfig } from "./toolsConfig.js";
import { renderFaqSchema } from "./utils/faqSchema";
import { BlogIndex } from "./components/Blog/BlogIndex";
import { BlogPostPage } from "./components/Blog/BlogPostPage";

const getToolSeoMetadata = (tool: any) => {
  let benefit = "";
  let keywordsStr = "";
  let descriptionStr = "";
  const canonicalUrl = `https://www.vedatool.com${tool.slug}`;

  switch (tool.id) {
    case "pdf-to-word-converter":
      benefit = "Preserve Layout & Tables";
      keywordsStr = "pdf to word, convert pdf to docx, pdf to docx online free, pdf file converter, editable word document, scan to word docx";
      descriptionStr = "Convert your PDF files to editable DOCX word documents online for free. Highly accurate layout preservation, table rendering, OCR scanning support.";
      break;
    case "pdf-to-text-ocr":
      benefit = "High Accuracy Layout-Aware OCR";
      keywordsStr = "pdf to text ocr, optical character recognition online, pdf reader text extractor, convert scanned pdf to txt, extract image text";
      descriptionStr = "Free online PDF to Text OCR converter. Highly accurate, layout-aware character recognition to extract clean text from scanned PDFs, images, booklets.";
      break;
    case "ai-chat-document-analyzer":
      benefit = "Talk with Scanned PDFs & Notes";
      keywordsStr = "ai chat document analyzer, chat with pdf online, scan image summary prompt, gemini multi-modal visual chat, intelligence notes reader";
      descriptionStr = "Talk to Veda AI, powered by advanced Gemini models. Interactively prompt, summarize, analyze visual charts, and answer questions from documents or images. Free.";
      break;
    case "youtube-seo-title-description-generator":
      benefit = "CTR & Video Rank Optimizer";
      keywordsStr = "youtube seo generator, viral youtube titles, video metadata optimizer, description maker, organic keywords tag rank, video ctr builder";
      descriptionStr = "Boost your video rank with viral YouTube titles, rich keyword-optimized descriptions, hashtags, and tag recommendations. Fully optimized for high-converting CTR.";
      break;
    case "pdf-page-arranger-merger":
      benefit = "Stitch, Rotate & Split Interactively";
      keywordsStr = "pdf page arranger, split pdf online, merge pdf documents, rotate pdf pages, duplicate pdf page editor, free pdf stitcher";
      descriptionStr = "Easily stitch, rotate, duplicate, split, delete, or merge multiple PDFs. High-fidelity drag-and-drop page editor to compile documents instantly for free.";
      break;
    case "pdf-watermark-remover":
      benefit = "Purge Repeated Backdrops & Links";
      keywordsStr = "pdf watermark remover, remove pdf watermark, delete watermark from pdf, erase pdf logo, strip telegram link watermark, clean pdf pages";
      descriptionStr = "Erase text, links, and repeated logo watermarks from your PDF files directly in your browser. Clean and safe, 100% free.";
      break;
    default:
      benefit = tool.description || "Free Interactive Online Tool";
      keywordsStr = `${tool.name.toLowerCase()}, veda tools`;
      descriptionStr = tool.description;
  }

  const titleStr = `${tool.name} Online Free — ${benefit} | VedaTool`;

  return {
    title: titleStr,
    description: descriptionStr,
    keywords: keywordsStr,
    canonical: canonicalUrl,
  };
};

function AppContent() {
  useTheme();
  const [user, loading] = useAuthState(auth);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [hasTriggeredAuth, setHasTriggeredAuth] = useState(false);
  const [checkingRedirectResult, setCheckingRedirectResult] = useState(true);
  const [iframeCookieBlocked, setIframeCookieBlocked] = useState(false);
  const [showCookieAlert, setShowCookieAlert] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem("sidebar_collapsed") === "true";
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("sidebar_collapsed", sidebarCollapsed ? "true" : "false");
  }, [sidebarCollapsed]);

  const showSidebar = location.pathname !== "/";

  useEffect(() => {
    const checkCookies = async () => {
      if (window.self !== window.top) {
        try {
          const res = await fetch("/api/config");
          if (res.ok) {
            const text = await res.text();
            if (text.includes("<html") || text.includes("Cookie check")) {
              setIframeCookieBlocked(true);
            }
          } else {
            setIframeCookieBlocked(true);
          }
        } catch (err) {
          setIframeCookieBlocked(true);
        }
      }
    };
    checkCookies();
  }, []);

  useEffect(() => {
    const isPathAdmin = window.location.pathname === "/admin-portal-dashboard-92837498cyeiuwreyr";
    const params = new URLSearchParams(window.location.search);

    if (isPathAdmin || params.get("admin") === "true") {
      setIsAdmin(true);
    }
  }, [location]);

  useEffect(() => {
    handleGoogleRedirectResult()
      .then((redirectUser) => {
        if (redirectUser) {
          setShowAuthModal(false);
          setHasTriggeredAuth(true);
          if (location.pathname === "/" || location.pathname === "/login") {
            navigate("/hub");
          }
        }
      })
      .catch((err) => {
        console.error("[GoogleAuth] Redirect result error:", err);
      })
      .finally(() => {
        setCheckingRedirectResult(false);
      });
  }, []);

  useEffect(() => {
    if (!loading && user) {
      setHasTriggeredAuth(true);
      setShowAuthModal(false);
      // If user is on landing page, redirect to hub
      if (location.pathname === "/") {
        navigate("/hub");
      }
    }
  }, [user, loading, location.pathname, navigate]);

  useEffect(() => {
    if (!loading && !checkingRedirectResult && !user && !hasTriggeredAuth) {
      const timer = setTimeout(() => {
        setShowAuthModal(true);
        setHasTriggeredAuth(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [user, loading, hasTriggeredAuth, checkingRedirectResult]);

  if (loading || checkingRedirectResult) {
    return (
      <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center">
        <AnalyticsTracker />
        <motion.div
           animate={{ rotate: 360 }}
           transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
           className="w-10 h-10 border-4 border-[var(--border-default)] border-t-[var(--brand-primary)] rounded-full"
        />
      </div>
    );
  }

  if (isAdmin) {
    return (
      <ErrorBoundary>
        <AnalyticsTracker />
        <AdminPanel />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen max-w-[100vw] overflow-x-hidden bg-[var(--bg-page)] font-sans">
        <AuthModal isOpen={showAuthModal && !user} onClose={() => setShowAuthModal(false)} />
        <TokenNotification />
        <ToastNotification />
        <AnalyticsTracker />
        <Navbar onMenuToggle={() => setMobileSidebarOpen(prev => !prev)} />
        
        {showSidebar && (
          <Sidebar 
            isCollapsed={sidebarCollapsed} 
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)} 
            mobileOpen={mobileSidebarOpen} 
            onCloseMobile={() => setMobileSidebarOpen(false)} 
          />
        )}
        
        {iframeCookieBlocked && showCookieAlert && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="fixed bottom-4 right-4 z-[9999] max-w-sm sm:max-w-md bg-[#16120e] text-amber-200 border border-amber-500/20 px-4 py-3.5 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-start gap-3 backdrop-blur-md"
          >
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs leading-relaxed font-sans text-amber-200/90">
              <span className="font-bold text-amber-400 text-[13px] block mb-1">IFrame Sandbox Constraint Detected</span>
              Your browser limits third-party storage & cookies within iframes. If PDF/MCQ conversions or document analytics fail, tap <strong>"Open in New Tab"</strong> at the top right to enable seamless operations.
            </div>
            <button 
              onClick={() => setShowCookieAlert(false)} 
              className="text-amber-500 hover:text-amber-300 p-0.5 rounded transition-colors shrink-0"
              aria-label="Dismiss"
            >
              <X size={15} />
            </button>
          </motion.div>
        )}
        
        <div className={`transition-all duration-200 ease-in-out ${showSidebar ? (sidebarCollapsed ? "sm:pl-[56px]" : "sm:pl-[260px]") : ""}`}>
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
            <Route
              path="/"
              element={
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Helmet>
                    <title>Whiteboard - Ultimate AI Productivity & Automation Hub</title>
                    <meta name="description" content="Whiteboard delivers advanced AI systems like Whiteboard AI, high-accuracy PDF converters, and YouTube SEO optimizers." />
                  </Helmet>
                  <LandingPage onStart={() => navigate("/hub")} />
                </motion.div>
              }
            />
            
            <Route
              path="/pricing"
              element={
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  className="pt-[48px]"
                >
                  <Helmet>
                    <title>Pricing Plans - Whiteboard Pro & Enterprise</title>
                    <meta name="description" content="Choose the perfect Whiteboard subscription. Scale your daily limits." />
                  </Helmet>
                  <PricingPlans onBack={() => navigate("/hub")} />
                </motion.div>
              }
            />
            
            <Route
              path="/profile"
              element={
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  className="pt-[48px]"
                >
                  <Helmet>
                    <title>My Account Dashboard - Whiteboard Workspace</title>
                    <meta name="description" content="Manage your Whiteboard profile, monitor daily message limits, adjust active keys." />
                  </Helmet>
                  <ProfileDashboard />
                </motion.div>
              }
            />
            
            <Route
              path="/hub"
              element={
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  className="pt-[48px]"
                >
                  <Helmet>
                    <title>Tool Hub - Whiteboard Intelligent Ecosystem</title>
                    <meta name="description" content="Access Whiteboard's entire repertoire of AI utilities." />
                  </Helmet>
                  <ToolSelection onSelect={(toolId) => navigate(toolId === "pricing" ? "/pricing" : `/tools/${toolId}`)} />
                </motion.div>
              }
            />
            
             {/* REDIRECTS FOR LEGACY TOOL URLS */}
            <Route path="/tools/pdf-converter" element={<Navigate to="/tools/pdf-to-text-ocr" replace />} />
            <Route path="/tools/pdf-" element={<Navigate to="/tools/pdf-to-word-converter" replace />} />
            <Route path="/tools/question-extractor" element={<Navigate to="/hub" replace />} />
            <Route path="/tools/veda-ai" element={<Navigate to="/tools/ai-chat-document-analyzer" replace />} />
            <Route path="/tools/whiteboard-ai" element={<Navigate to="/tools/ai-chat-document-analyzer" replace />} />
            <Route path="/tools/youtube-seo" element={<Navigate to="/tools/youtube-seo-title-description-generator" replace />} />
            <Route path="/tools/pdf-arranger" element={<Navigate to="/tools/pdf-page-arranger-merger" replace />} />            {/* DYNAMIC SEO-OPTIMIZED TOOL ROUTES GENERATED FROM CENTRAL CONFIGURATION FILE */}
            {toolsConfig.map((tool) => {
              const { title, description, keywords, canonical } = getToolSeoMetadata(tool);
              
              // Determine component elements
              let childComponent = null;
              let isWidescreenOnly = false;
              let hasHeaderAndFooter = true;
              let headerTitle = tool.name;
              let headerSubtitle = "";
              let seoFooterId = "";
              let iconElement = null;
              let iconBg = tool.iconBgColor || "#6366F1";

              switch (tool.id) {
                case "pdf-to-text-ocr":
                  childComponent = <PdfConverter />;
                  headerTitle = "PDF to Text (OCR)";
                  headerSubtitle = "Human-like OCR accuracy for scanned documents. Extracts text and layout.";
                  seoFooterId = "pdf-to-text";
                  iconElement = <FileText size={20} />;
                  break;
                case "pdf-to-word-converter":
                  childComponent = <PdfToDocxConverter />;
                  headerTitle = "PDF to DOCX Converter";
                  headerSubtitle = "AI-powered conversion preserving formatting, tables, and images.";
                  seoFooterId = "pdf-to-word";
                  iconElement = <ArrowLeftRight size={20} />;
                  break;
                case "ai-chat-document-analyzer":
                  childComponent = <ChatApp />;
                  hasHeaderAndFooter = false;
                  isWidescreenOnly = true;
                  break;
                case "youtube-seo-title-description-generator":
                  childComponent = <YoutubeSeoTool />;
                  headerSubtitle = "Generate viral titles, descriptions, and hashtags with AI.";
                  seoFooterId = "youtube-seo";
                  iconElement = <Youtube size={20} />;
                  iconBg = iconBg || "#E63946";
                  break;
                case "pdf-page-arranger-merger":
                  childComponent = <PdfArranger onBackToHub={() => navigate("/hub")} />;
                  headerSubtitle = "Arrange, rotate, duplicate, split, and merge multiple documents.";
                  seoFooterId = "pdf-arranger";
                  iconElement = <LayoutGrid size={20} />;
                  break;
                case "pdf-watermark-remover":
                  childComponent = <PdfWatermarkRemover />;
                  headerSubtitle = "Purge repeated text links, Telegram URLs, and background image watermarks.";
                  seoFooterId = "pdf-watermark-remover";
                  iconElement = <Trash2 size={20} />;
                  break;
                case "mcq-extractor-from-pdf":
                  childComponent = <McqWorkspace />;
                  hasHeaderAndFooter = false;
                  isWidescreenOnly = true;
                  break;
              }

              return (
                <Route
                  key={tool.id}
                  path={tool.slug}
                  element={
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 20 }}
                      className={isWidescreenOnly ? "pt-[48px] h-screen flex flex-col overflow-hidden" : "pt-[48px]"}
                    >
                      <Helmet>
                        <title>{title}</title>
                        <meta name="description" content={description} />
                        <meta name="keywords" content={keywords} />
                        <link rel="canonical" href={canonical} />
                        <meta property="og:title" content={title} />
                        <meta property="og:description" content={description} />
                        <meta property="og:url" content={canonical} />
                        <meta property="og:type" content="website" />
                        <script type="application/ld+json">
                          {JSON.stringify({
                            "@context": "https://schema.org",
                            "@type": "SoftwareApplication",
                            "name": tool.name,
                            "url": canonical,
                            "description": tool.description,
                            "applicationCategory": tool.category === "education" ? "EducationalApplication" : "UtilitiesApplication",
                            "operatingSystem": "All",
                            "offers": {
                              "@type": "Offer",
                              "price": "0",
                              "priceCurrency": "USD"
                            },
                            "featureList": ["No signup required", "Instant download", "Privacy secure"],
                            "provider": {
                              "@type": "Organization",
                              "name": "VedaTool",
                              "url": "https://www.vedatool.com"
                            }
                          })}
                        </script>
                        {renderFaqSchema(tool.id)}
                      </Helmet>
                      {hasHeaderAndFooter ? (
                        <>
                          <ToolPageHeader
                            icon={iconElement}
                            iconBgColor={iconBg}
                            title={headerTitle}
                            subtitle={headerSubtitle}
                            badges={tool.badge ? [tool.badge as any] : []}
                            onBack={() => navigate("/hub")}
                          />
                          <div className={tool.id === "pdf-page-arranger-merger" || tool.id === "pdf-watermark-remover" ? "p-2 sm:p-4 md:px-8 flex-1 overflow-x-hidden" : "p-2 sm:p-4 md:px-8"}>
                             {childComponent}
                          </div>
                          {seoFooterId && <SeoFooter toolId={seoFooterId as any} />}
                        </>
                      ) : (
                        <div className={tool.id === "mcq-extractor-from-pdf" ? "w-full flex-1 flex min-h-[calc(100vh-48px)] overflow-hidden" : "flex-1 overflow-hidden"}>
                          {childComponent}
                        </div>
                      )}
                    </motion.div>
                  }
                />
              );
            })}

             {/* EXPORT STUDIO */}
            <Route
              path="/tools/export-studio"
              element={
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
                  <Helmet>
                    <title>Printable PDF & WORD Export Studio - Whiteboard</title>
                    <meta name="description" content="Customize layouts, set branding, watermarks, QA tables, and generate Word DOCX/PDF formats." />
                  </Helmet>
                  <ExportStudio />
                </motion.div>
              }
            />

            {/* SEOPAGE - RESOURCE DIRECTORY BLOG */}
            <Route
              path="/blog"
              element={
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="pt-[48px]"
                >
                  <BlogIndex />
                </motion.div>
              }
            />

            <Route
              path="/blog/:slug"
              element={
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="pt-[48px]"
                >
                  <BlogPostPage />
                </motion.div>
              }
            />

            <Route path="/admin-portal-dashboard-92837498cyeiuwreyr" element={<ErrorBoundary><AnalyticsTracker /><AdminPanel /></ErrorBoundary>} />
            </Routes>
          </AnimatePresence>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default function App() {
  return <AppContent />;
}
