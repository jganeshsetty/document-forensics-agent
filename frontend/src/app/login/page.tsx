"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { login, register, isAuthenticated } from "@/lib/api";
import {
  ShieldCheck,
  Lock,
  Mail,
  User,
  Building,
  Eye,
  EyeOff,
  ArrowRight,
  Zap,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";

export default function LoginPage() {
  const router = useRouter();

  // Mode: "login" or "signup"
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [organization, setOrganization] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // If already authenticated, redirect to /dashboard
  useEffect(() => {
    if (isAuthenticated()) {
      router.replace("/dashboard");
    }
  }, [router]);

  // One-click Auto-fill test credentials
  const applyTestCredentials = () => {
    setAuthMode("login");
    setEmail("admin@docverify.com");
    setPassword("password123");
    setErrorMsg(null);
    setSuccessMsg("Test credentials loaded. Click 'Sign In' below.");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (authMode === "login") {
        await login(email, password);
        setSuccessMsg("Authentication verified. Redirecting to Dashboard...");
        setTimeout(() => {
          router.push("/dashboard");
        }, 300);
      } else {
        await register(
          email,
          password,
          fullName || "Forensic Analyst",
          organization || "Enterprise Security Ops"
        );
        setSuccessMsg("Account created and signed in! Redirecting...");
        setTimeout(() => {
          router.push("/dashboard");
        }, 400);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex items-center justify-center p-4 sm:p-6 antialiased selection:bg-blue-600/20 selection:text-blue-600 relative overflow-hidden">
      {/* Subtle Background Glows */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-500/10 dark:bg-blue-600/15 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-80 h-80 bg-indigo-500/10 dark:bg-indigo-600/10 rounded-full blur-2xl pointer-events-none -z-10" />

      <main className="w-full max-w-md mx-auto">
        <div className="flex flex-col w-full items-center justify-center relative">
          {/* Brand Header */}
          <header className="flex flex-col items-center text-center mb-6 max-w-sm">
            <Link href="/" className="flex items-center gap-2 mb-2 group">
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20 group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-semibold text-lg tracking-tight text-zinc-900 dark:text-zinc-100">
                  DocVerify
                </span>
                <span className="text-[10px] font-mono font-medium text-blue-600 dark:text-blue-400 uppercase tracking-widest bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-900">
                  Forensics
                </span>
              </div>
            </Link>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs leading-relaxed">
              Sign in to your account or create a new one to access the forensic analysis workspace.
            </p>
          </header>

          {/* Main Card Container */}
          <div className="w-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-xl p-6 sm:p-7 flex flex-col gap-5 relative backdrop-blur-sm">
            {/* Top Segmented Switch (Sign In / Sign Up) */}
            <div className="w-full grid grid-cols-2 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={authMode === "login"}
                onClick={() => {
                  setAuthMode("login");
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className={`py-2 px-3 rounded-lg text-center text-xs font-semibold transition-all duration-150 ${
                  authMode === "login"
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authMode === "signup"}
                onClick={() => {
                  setAuthMode("signup");
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className={`py-2 px-3 rounded-lg text-center text-xs font-semibold transition-all duration-150 ${
                  authMode === "signup"
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                }`}
              >
                Sign Up
              </button>
            </div>

            {/* Alert Messages */}
            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Form Section */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {/* Additional Registration Fields */}
              {authMode === "signup" && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Full Name
                    </label>
                    <div className="relative flex items-center">
                      <User className="absolute left-3 w-4 h-4 text-zinc-400 pointer-events-none" />
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="John Doe"
                        required={authMode === "signup"}
                        className="w-full h-9 pl-9 pr-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-600 transition-all shadow-2xs"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Organization
                    </label>
                    <div className="relative flex items-center">
                      <Building className="absolute left-3 w-4 h-4 text-zinc-400 pointer-events-none" />
                      <input
                        type="text"
                        value={organization}
                        onChange={(e) => setOrganization(e.target.value)}
                        placeholder="Forensic Lab / Enterprise"
                        required={authMode === "signup"}
                        className="w-full h-9 pl-9 pr-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-600 transition-all shadow-2xs"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Email Field */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Email
                </label>
                <div className="relative flex items-center">
                  <Mail className="absolute left-3 w-4 h-4 text-zinc-400 pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    required
                    className="w-full h-9 pl-9 pr-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-600 transition-all shadow-2xs"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Password
                </label>
                <div className="relative flex items-center">
                  <Lock className="absolute left-3 w-4 h-4 text-zinc-400 pointer-events-none" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    className="w-full h-9 pl-9 pr-9 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-600 transition-all shadow-2xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-10 mt-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-sm shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{authMode === "login" ? "Signing In..." : "Creating Account..."}</span>
                  </>
                ) : (
                  <>
                    <span>{authMode === "login" ? "Sign In" : "Sign Up"}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Test Credentials Card */}
            <div className="rounded-xl p-3.5 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/50 flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded flex items-center justify-center bg-blue-600 text-white shadow-2xs">
                    <KeyRound className="w-3 h-3" />
                  </div>
                  <span className="text-xs font-semibold text-blue-950 dark:text-blue-300">
                    Test Credentials
                  </span>
                </div>
                <span className="px-1.5 py-0.5 rounded font-mono text-[9px] bg-blue-200/60 dark:bg-blue-900/70 text-blue-800 dark:text-blue-200 font-semibold tracking-wider">
                  DEFAULT USER
                </span>
              </div>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                Email: <code className="bg-white dark:bg-zinc-900 px-1.5 py-0.5 rounded font-mono text-[10px] border border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300">admin@docverify.com</code>
                <br className="sm:hidden" />
                <span className="hidden sm:inline"> | </span>
                Password: <code className="bg-white dark:bg-zinc-900 px-1.5 py-0.5 rounded font-mono text-[10px] border border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300">password123</code>
              </p>
              <button
                type="button"
                onClick={applyTestCredentials}
                className="w-full py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Auto-fill Credentials</span>
              </button>
            </div>
          </div>

          {/* Clean Footer Link */}
          <div className="mt-4 text-center">
            <Link
              href="/"
              className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
            >
              ← Back to Overview
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
