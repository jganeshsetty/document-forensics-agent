"use client";

import React from "react";
import Link from "next/link";
import { useTheme, useIsMounted } from "@/components/ThemeProvider";
import {
  ShieldCheck,
  ArrowRight,
  FileText,
  CheckCircle2,
  Fingerprint,
  Network,
  Sun,
  Moon,
  Download,
  Check,
  Cpu,
} from "lucide-react";

export default function LandingPage() {
  const { setTheme, resolvedTheme } = useTheme();
  const mounted = useIsMounted();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col antialiased selection:bg-blue-600/20 selection:text-blue-600">
      {/* Fixed Sticky Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800 transition-colors">
        <div className="h-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/25 group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <span className="font-semibold text-base sm:text-lg tracking-tight text-zinc-900 dark:text-zinc-100">
                officedocuments
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              <a href="#overview" className="hover:text-blue-600 dark:hover:text-zinc-100 transition-colors">
                Overview
              </a>
              <a href="#features" className="hover:text-blue-600 dark:hover:text-zinc-100 transition-colors">
                Features
              </a>
              <a href="#dossier" className="hover:text-blue-600 dark:hover:text-zinc-100 transition-colors">
                Court Dossier
              </a>
              <a href="#security" className="hover:text-blue-600 dark:hover:text-zinc-100 transition-colors">
                Security &amp; Standards
              </a>
            </nav>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <button
              type="button"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Toggle Theme"
              aria-label="Toggle Theme"
            >
              {mounted && resolvedTheme === "dark" ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>

            {/* Enter Platform Button */}
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center gap-1.5 px-4 h-8 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition-all"
            >
              <span>Enter Platform</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Landing Page Content */}
      <main className="flex-1 w-full pt-16" id="overview">
        {/* Hero Section */}
        <div className="relative w-full overflow-hidden">
          {/* Ambient Subtle Glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[360px] bg-blue-500/10 dark:bg-blue-600/15 blur-[130px] rounded-full pointer-events-none -z-10" />

          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20 lg:pt-24 lg:pb-28 flex flex-col items-center text-center">
            {/* Announcement Pill */}
            <a
              href="#features"
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium transition-all hover:border-blue-500 mb-8 shadow-2xs"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
              <span>officedocuments v2.4 • Next-Gen Contextual Forensics engine live</span>
              <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
            </a>

            {/* Main Headline */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 max-w-4xl leading-[1.12] mb-6">
              Enterprise Document Forensics &amp; Contextual Intelligence
            </h1>

            {/* Subheadline */}
            <p className="text-sm sm:text-base lg:text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto mb-8 leading-relaxed">
              Detect micro-tampering, trace multi-contract entity relationships, and cross-examine evidentiary records with automated AI Vision OCR and cryptographic verification.
            </p>

            {/* Hero Actions */}
            <div className="flex flex-col sm:flex-row items-center gap-3 mb-8 w-full sm:w-auto">
              <Link
                href="/dashboard"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-all shadow-sm shadow-blue-500/25"
              >
                <span>Enter Platform</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#dossier"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 h-10 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 font-medium text-xs transition-colors shadow-2xs"
              >
                <FileText className="w-4 h-4 text-zinc-400" />
                <span>View Forensic Dossier</span>
              </a>
            </div>

            {/* Trust Indicator Strip */}
            <div className="flex items-center gap-2 text-xs text-zinc-500 mb-14">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Zero-knowledge SHA-256 pipeline • NIST FIPS 180-4 Certified</span>
            </div>

            {/* Interactive Preview Card (Efferd Aesthetics) */}
            <div className="w-full max-w-5xl rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl p-4 sm:p-6 text-left">
              {/* Window Header */}
              <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  </div>
                  <span className="text-zinc-500 dark:text-zinc-400 font-mono text-xs">
                    audit_session_#89201.pdf
                  </span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-mono font-medium border border-emerald-200 dark:border-emerald-900">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  <span>LIVE VERIFICATION ACTIVE</span>
                </div>
              </div>

              {/* Forensic Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-850">
                  <span className="text-xs text-zinc-500">Integrity Pass Rate</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">99.8%</span>
                    <span className="text-xs text-emerald-600 font-mono">+0.04%</span>
                  </div>
                  <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full mt-3 overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: "99.8%" }} />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-850">
                  <span className="text-xs text-zinc-500">Raster Alignment</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Δ 0.008<span className="text-xs text-zinc-400">mm</span></span>
                    <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded font-mono">Clean</span>
                  </div>
                  <span className="text-[11px] text-zinc-400 mt-2 block font-mono">Baseline Match: 100%</span>
                </div>

                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-850">
                  <span className="text-xs text-zinc-500">SHA-256 Digest Anchor</span>
                  <div className="text-xs font-mono text-zinc-700 dark:text-zinc-300 mt-1 truncate">
                    0x7f48c1a...92b50fe49e2
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-zinc-400 mt-2">
                    <span className="font-mono">Block #18,492,021</span>
                    <span className="text-emerald-600 font-medium">Confirmed</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Metrics & Telemetry Strip */}
        <section className="w-full bg-zinc-100/70 dark:bg-zinc-900/60 border-y border-zinc-200/80 dark:border-zinc-800 py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              <div className="flex flex-col gap-1">
                <span className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">10M+</span>
                <span className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">Documents Verified</span>
                <span className="text-[11px] text-zinc-400 font-mono">Tamper-free evidentiary records</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">0.01mm</span>
                <span className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">Font Precision</span>
                <span className="text-[11px] text-zinc-400 font-mono">Sub-pixel raster divergence</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">&lt; 450ms</span>
                <span className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">Ingestion Latency</span>
                <span className="text-[11px] text-zinc-400 font-mono">Fast-Path ONNX processing</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">FIPS 140-3</span>
                <span className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">Security Standard</span>
                <span className="text-[11px] text-zinc-400 font-mono">HSM cryptographic enclave</span>
              </div>
            </div>
          </div>
        </section>

        {/* Features Bento Grid */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28" id="features">
          <div className="mb-14 text-center sm:text-left">
            <span className="text-xs font-mono uppercase tracking-widest text-blue-600 dark:text-blue-400 block mb-2 font-semibold">
              Forensic Modules
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100 max-w-2xl">
              Architected for deep forensic depth and strict regulatory scrutiny.
            </h2>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-xl mt-2">
              Move beyond superficial OCR. officedocuments applies structural, lexical, and cryptographic integrity engines simultaneously.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 p-6 sm:p-7 flex flex-col justify-between shadow-2xs hover:border-blue-500/50 transition-colors">
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 flex items-center justify-center mb-5">
                  <Cpu className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                  AI Vision &amp; RapidOCR
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed mb-6">
                  High-speed PaddleOCR PP-OCRv4 ONNX engine that handles complex security watermarks and guilloche patterns without freezing.
                </p>
              </div>

              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-850 p-3.5 font-mono text-[11px] space-y-1.5">
                <div className="flex items-center justify-between text-zinc-400 pb-1">
                  <span>GLYPH_ISOLATION</span>
                  <span className="text-emerald-600 font-semibold">PASS</span>
                </div>
                <div className="flex items-center justify-between text-zinc-700 dark:text-zinc-300">
                  <span>Font: Garamond 11pt</span>
                  <span className="text-zinc-400">Weight: 400</span>
                </div>
                <div className="flex items-center justify-between text-zinc-700 dark:text-zinc-300">
                  <span>Target Stamp Area</span>
                  <span className="text-blue-600">Native Vector</span>
                </div>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 p-6 sm:p-7 flex flex-col justify-between shadow-2xs hover:border-blue-500/50 transition-colors">
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 flex items-center justify-center mb-5">
                  <Fingerprint className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                  OpenCV Visual ELA
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed mb-6">
                  Error Level Analysis to detect JPEG re-compression variances, pixel splicing, copy-paste alterations, and official stamp verification.
                </p>
              </div>

              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-850 p-3.5 font-mono text-[11px] space-y-1.5">
                <div className="flex items-center justify-between text-zinc-400 pb-1">
                  <span>CHAIN_OF_CUSTODY</span>
                  <span className="text-blue-600 font-semibold">VERIFIED</span>
                </div>
                <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="truncate">Signed: 2026-02-18T10:14:02Z</span>
                </div>
                <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="truncate">Key Hash: 0x9028...b71c</span>
                </div>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 p-6 sm:p-7 flex flex-col justify-between shadow-2xs hover:border-blue-500/50 transition-colors">
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 flex items-center justify-center mb-5">
                  <Network className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                  ChromaDB Vector RAG
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed mb-6">
                  Contextual knowledge retrieval and Groq Llama-3.3 verification for math consistency, marks calculation, and investigator chat.
                </p>
              </div>

              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-850 p-3.5 font-mono text-[11px] space-y-1.5">
                <div className="flex items-center justify-between text-zinc-400 pb-1">
                  <span>GRAPH_RELATION</span>
                  <span className="text-zinc-400">3 ENTITIES</span>
                </div>
                <div className="flex items-center justify-between text-zinc-700 dark:text-zinc-300">
                  <span>Marks Total ↔ Grade</span>
                  <span className="text-emerald-600">Matched</span>
                </div>
                <div className="flex items-center justify-between text-zinc-700 dark:text-zinc-300">
                  <span>Registration ID</span>
                  <span className="text-emerald-600">Verified</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Court-Admissible Dossier Showcase */}
        <section className="w-full bg-zinc-100/70 dark:bg-zinc-900/60 border-y border-zinc-200/80 dark:border-zinc-800 py-20" id="dossier">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-12">
              <div className="max-w-xl text-left">
                <span className="text-xs font-mono uppercase tracking-widest text-blue-600 dark:text-blue-400 block mb-2 font-semibold">
                  Court-Admissible Output
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">
                  Automated forensic dossiers ready for litigation and disclosure.
                </h2>
                <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 mb-6 leading-relaxed">
                  Generate verifiable dossiers equipped with embedded cryptographic proofs, micro-raster comparisons, and side-by-side alteration logs that stand up under judicial scrutiny.
                </p>
                <ul className="space-y-3 text-xs text-zinc-700 dark:text-zinc-300">
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <span>NIST FIPS 180-4 SHA-256 integrity validation</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <span>Sub-pixel alteration heatmaps with differential coordinates</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <span>Audit trail sealed via cryptographic timestamping</span>
                  </li>
                </ul>
              </div>

              {/* Dossier Visual Graphic Card */}
              <div className="w-full lg:w-1/2 p-5 sm:p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xl">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-blue-600" />
                    <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                      Forensic Summary Dossier
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                    NIST SP 800-88
                  </span>
                </div>

                <div className="space-y-2.5 font-mono text-xs my-4">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-850">
                    <span className="text-zinc-400">Target File</span>
                    <span className="text-zinc-800 dark:text-zinc-200">10th_marks_card.jpeg</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-850">
                    <span className="text-zinc-400">Digest</span>
                    <span className="text-zinc-800 dark:text-zinc-200 font-mono">e3b0c44298fc1c149afbf4...</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-850">
                    <span className="text-zinc-400">Micro-Tampering</span>
                    <span className="text-emerald-600 font-semibold">0.000% (No Alteration)</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-850 flex items-center justify-between text-xs text-zinc-500">
                  <span>Export format: Cryptographic JSON Dossier</span>
                  <Download className="w-4 h-4 text-blue-600" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Call to Action Banner */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 w-full" id="security">
          <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 p-8 sm:p-12 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
            <div className="max-w-xl text-center md:text-left">
              <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight mb-2">
                Ready to audit evidentiary documentation?
              </h2>
              <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
                Sign in with enterprise credentials or test with one-click evaluation access.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
              <Link
                href="/dashboard"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-all shadow-sm shadow-blue-500/25"
              >
                <span>Launch Console</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Enterprise Footer */}
      <footer className="w-full bg-white dark:bg-zinc-950 border-t border-zinc-200/80 dark:border-zinc-800 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <div>© 2026 officedocuments Enterprise Security Operations. All rights reserved.</div>
          <div className="flex items-center gap-4 font-mono text-[10px]">
            <span>NIST SP 800-63B</span>
            <span>•</span>
            <span>FIPS 140-3</span>
            <span>•</span>
            <span>SOC2 TYPE II</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
