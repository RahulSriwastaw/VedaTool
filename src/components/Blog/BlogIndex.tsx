import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { blogPosts, BlogPost } from "../../data/blogData";
import { ArrowLeft, BookOpen, Clock, Calendar, Tag, ChevronRight, Search } from "lucide-react";
import { motion } from "motion/react";
import { Helmet } from "react-helmet-async";

export const BlogIndex: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const filteredPosts = blogPosts.filter((post) => {
    const matchesSearch =
      post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.excerpt.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.keywords.some((kw) => kw.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory = activeCategory === "all" || post.category === activeCategory;

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="max-w-[1250px] w-full mx-auto px-4 md:px-6 py-6 font-sans">
      <Helmet>
        <title>VedaTool Hub Guides & Comparison Index | VedaTool</title>
        <meta
          name="description"
          content="Access detailed VedaTool tutorials, feature comparisons, and productivity directories designed for Indian student teams and creative professionals."
        />
        <link rel="canonical" href="https://www.vedatool.com/blog" />
      </Helmet>

      {/* Breadcrumb Row */}
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-4">
        <Link to="/hub" className="hover:text-[var(--accent)] transition-colors">Tool Hub</Link>
        <ChevronRight size={12} />
        <span className="text-[var(--text-secondary)] font-medium">Guides & Blog</span>
      </div>

      {/* Back button */}
      <button
        onClick={() => navigate("/hub")}
        className="inline-flex items-center gap-1.5 text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] font-medium mb-6 transition-colors group cursor-pointer"
      >
        <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
        Back to Tool Hub
      </button>

      {/* Index Title Block */}
      <div className="mb-10 max-w-2xl">
        <h1 className="text-3xl md:text-4xl font-bold text-[var(--text-primary)] mb-3 tracking-tight">
          VedaTool Resource Directory
        </h1>
        <p className="text-[var(--text-secondary)] text-sm md:text-base leading-relaxed">
          Detailed tutorials, comparisons, and structural templates to automate PDF processing, extract exam pools, and maximize your productivity with visual layout analysis.
        </p>
      </div>

      {/* Search-First System */}
      <div className="mb-8 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        {/* Category Pill Bar */}
        <div className="flex flex-wrap gap-2 items-center">
          {[
            { id: "all", label: "All Resources" },
            { id: "tutorials", label: "Tutorials" },
            { id: "comparisons", label: "Comparisons" },
            { id: "roundups", label: "Roundups" },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all ${
                activeCategory === cat.id
                  ? "bg-[var(--accent)] text-white shadow-sm"
                  : "bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-card)]"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Local Search Input Area */}
        <div className="relative w-full sm:max-w-xs">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
            <Search size={14} />
          </span>
          <input
            type="text"
            placeholder="Search guides or topics..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg outline-none focus:border-[var(--accent)] text-[var(--text-primary)] placeholder-[var(--text-muted)] h-[38px]"
          />
        </div>
      </div>

      {/* Output / Post Grid */}
      {filteredPosts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPosts.map((post, i) => (
            <motion.article
              key={post.slug}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
              className="group flex flex-col justify-between bg-[var(--bg-card)] border border-[var(--border-card)] hover:border-[var(--accent)] p-5 rounded-xl hover:shadow-[var(--shadow-card-hover)] transition-all h-[280px]"
            >
              <div>
                {/* Meta Details */}
                <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)] mb-3">
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    {post.publishDate}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    {post.readTime}
                  </span>
                </div>

                {/* Article Name */}
                <h3 className="text-sm font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors mb-2 line-clamp-2 leading-snug">
                  <Link to={`/blog/${post.slug}`} className="outline-none">
                    {post.title}
                  </Link>
                </h3>

                {/* Excerpt */}
                <p className="text-[var(--text-secondary)] text-xs leading-relaxed line-clamp-3 mb-4">
                  {post.excerpt}
                </p>
              </div>

              {/* Related keywords & bottom link */}
              <div className="flex items-center justify-between pt-3 border-t border-[var(--divider)]">
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                  <Tag size={10} />
                  {post.category}
                </span>

                <Link
                  to={`/blog/${post.slug}`}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--accent)] group-hover:translate-x-0.5 transition-transform outline-none"
                >
                  Read Guide
                  <ChevronRight size={12} />
                </Link>
              </div>
            </motion.article>
          ))}
        </div>
      ) : (
        <div className="bg-[var(--bg-card)] border border-[var(--border-card)] p-12 text-center rounded-xl my-6">
          <BookOpen className="mx-auto text-[var(--text-muted)] mb-4" size={32} />
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1">No matching articles found</h3>
          <p className="text-[var(--text-secondary)] text-xs">Try searching for other terms like "Formatting", "OCR", or "SEO".</p>
        </div>
      )}
    </div>
  );
};
