"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { API_BASE, type ChatResponse } from "@/lib/api";

export default function ChatView() {
  const [docId, setDocId] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const question = input.trim();
    if (!question || !docId || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: docId, question, n_results: 5 }),
      });
      const data: ChatResponse = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
    } catch (err) {
      setError(String(err));
      setMessages((prev) => [...prev, { role: "assistant", content: "Failed to get a response. Please check the API connection." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-strong flex flex-col h-[600px] overflow-hidden">
      {/* Doc ID Input */}
      <div className="p-4 border-b border-white/5 flex gap-3">
        <div className="relative flex-1">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
            <path d="M11 4h1a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2h5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M7 10h6M7 14h4" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Document ID to query..."
            value={docId}
            onChange={(e) => setDocId(e.target.value)}
            className="w-full pl-10 bg-[#0f0f13] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 transition-all"
          />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence>
          {messages.map((msg, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "chat-bubble-user text-gray-100"
                    : "chat-bubble-ai text-gray-300"
                }`}
              >
                {msg.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="chat-bubble-ai px-4 py-3 flex items-center gap-2">
              <span className="pulse-dot orange" />
              <span className="text-xs text-gray-500">Querying ChromaDB & generating...</span>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-500/10 border-t border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-white/5 flex gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Ask about the document..."
            className="w-full bg-[#0f0f13] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 transition-all"
            disabled={loading || !docId}
          />
        </div>
        <button
          onClick={send}
          disabled={loading || !input.trim() || !docId}
          className="px-5 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 disabled:bg-gray-800 disabled:text-gray-500 text-white rounded-xl transition-all duration-200 flex-shrink-0"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M16 2L8 10M16 2l-5 14-3-6-6-3 14-5z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}