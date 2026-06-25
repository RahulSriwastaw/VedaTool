import React from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { blogPosts } from "../../data/blogData";
import { toolsConfig } from "../../lib/toolsConfig";
import { ArrowLeft, Clock, Calendar, ChevronRight, User, Share2, Tag, HelpCircle, ArrowRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Helmet } from "react-helmet-async";
import { motion } from "motion/react";

export const BlogPostPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const post = blogPosts.find((p) => p.slug === slug);

  if (!post) {
    return (
      <div className="max-w-[800px] mx-auto px-4 py-16 text-center select-none font-sans">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-4">Article Not Found</h1>
        <p className="text-[var(--text-secondary)] mb-8">The guide page you entered could not be found. Let's return to the Tool Hub.</p>
        <Link
          to="/blog"
          className="inline-flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-5 py-2.5 rounded-lg text-xs font-bold transition-all"
        >
          <ArrowLeft size={14} />
          View All Resources
        </Link>
      </div>
    );
  }

  // Find related tools objects
  const postCategories = [post.category];
  const relatedToolsMap = toolsConfig.filter((t) => 
    t.relatedTools.includes(post.slug) || 
    post.category === "tutorials" && t.category === "pdf" ||
    post.category === "comparisons" && t.isPro ||
    t.id === "pdf-to-word-converter"
  ).slice(0, 3);

  const canonicalUrl = `https://www.vedatool.com/blog/${post.slug}`;

  // Custom JSON-LD schema
  const schemaMarkup = {
    "@context": "https://schema.org",
    "@type": post.schemaType,
    "headline": post.title,
    "description": post.excerpt,
    "datePublished": post.publishDate,
    "author": {
      "@type": "Person",
      "name": post.author
    },
    "publisher": {
      "@type": "Organization",
      "name": "VedaTool",
      "logo": {
        "@type": "ImageObject",
        "url": "https://www.vedatool.com/logo.png"
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": canonicalUrl
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 font-sans">
      <Helmet>
        <title>{`${post.title} | VedaTool Guides`}</title>
        <meta name="description" content={post.excerpt} />
        <meta name="keywords" content={post.keywords.join(", ")} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.excerpt} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:type" content="article" />
        <script type="application/ld+json">
          {JSON.stringify(schemaMarkup)}
        </script>
      </Helmet>

      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-5">
        <Link to="/hub" className="hover:text-[var(--accent)] transition-colors">Tool Hub</Link>
        <ChevronRight size={12} />
        <Link to="/blog" className="hover:text-[var(--accent)] transition-colors">Resources</Link>
        <ChevronRight size={12} />
        <span className="text-[var(--text-secondary)] font-medium truncate max-w-[200px] sm:max-w-none">
          {post.title}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Main reading pane */}
        <div className="lg:col-span-8">
          <Link
            to="/blog"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] font-medium mb-5 transition-colors"
          >
            <ArrowLeft size={14} />
            Back to All Guides
          </Link>

          <article className="bg-[var(--bg-card)] border border-[var(--border-card)] p-5 sm:p-8 rounded-xl">
            {/* Header metadata */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-muted)] mb-4">
              <span className="flex items-center gap-1.5 bg-[var(--accent-subtle)] text-[var(--accent)] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider">
                <Tag size={12} />
                {post.category}
              </span>
              <span className="flex items-center gap-1">
                <Calendar size={13} />
                {post.publishDate}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={13} />
                {post.readTime}
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-[var(--text-primary)] leading-tight mb-6 tracking-tight">
              {post.title}
            </h1>

            {/* Author row */}
            <div className="flex items-center justify-between py-4 border-y border-[var(--divider)] mb-8 text-xs text-[var(--text-secondary)]">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-[var(--bg-hover)] text-[var(--text-secondary)] flex items-center justify-center rounded-full border border-[var(--border-card)]">
                  <User size={13} />
                </div>
                <span>By <span className="font-semibold text-[var(--text-primary)]">{post.author}</span></span>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  alert("Link copied to clipboard!");
                }}
                className="flex items-center gap-1 cursor-pointer hover:text-[var(--accent)] transition-colors py-1 px-2.5 bg-[var(--bg-hover)] border border-[var(--border-card)] rounded-md"
              >
                <Share2 size={12} />
                Share URL
              </button>
            </div>

            {/* Markdown rendered body */}
            <div className="markdown-body text-[var(--text-primary)] text-sm leading-relaxed space-y-6">
              <ReactMarkdown>{post.contentMarkdown}</ReactMarkdown>
            </div>
          </article>
        </div>

        {/* Sidebar widgets for better organic internal matching */}
        <div className="lg:col-span-4 space-y-6">
          {/* Related tools listing */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-card)] p-5 rounded-xl">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] pb-3 border-b border-[var(--divider)] mb-4 flex items-center gap-2">
              <span>Related AI Tools</span>
            </h3>

            <div className="space-y-3">
              {relatedToolsMap.map((tool) => (
                <div
                  key={tool.id}
                  onClick={() => navigate(tool.slug)}
                  className="group flex items-center gap-3 p-3 bg-[var(--bg-hover)] border border-transparent hover:border-[var(--accent)] rounded-lg cursor-pointer transition-all"
                >
                  <div
                    className="w-8 h-8 rounded-md flex items-center justify-center text-white shrink-0"
                    style={{ backgroundColor: tool.iconBgColor }}
                  >
                    <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-[12px] font-bold text-[var(--text-primary)] leading-none truncate mb-1">
                      {tool.name}
                    </h4>
                    <p className="text-[10px] text-[var(--text-muted)] line-clamp-1 leading-normal">
                      {tool.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => navigate("/hub")}
              className="w-full mt-4 text-center py-2 bg-[var(--bg-hover)] border border-[var(--border-card)] hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)] text-[11px] font-bold text-[var(--text-secondary)] hover:text-[var(--accent)] rounded-lg transition-all"
            >
              Browse All Tools
            </button>
          </div>

          {/* Privacy Trust Card */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-card)] p-5 rounded-xl text-xs space-y-3 leading-relaxed">
            <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-1.5 text-xs pb-2 border-b border-[var(--divider)]">
              <HelpCircle size={15} className="text-[var(--accent)]" />
              Corporate Privacy Guarantee
            </h3>
            <p className="text-[var(--text-secondary)]">
              Working with corporate reports, CB SE papers, or commercial agreements? All documents uploaded are processed directly in encrypted memory pipelines and destroyed safely immediately upon wrap-up.
            </p>
            <div className="pt-2 font-semibold text-[var(--accent)] flex items-center gap-1">
              • Secure HTTPS Channels • No Persistent Logs
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
