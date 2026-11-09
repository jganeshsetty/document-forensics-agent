"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  DocumentRecord,
  fetchDocuments,
  askAssistant,
  ChatResponse,
} from "@/lib/api";
import {
  Bot,
  User,
  Sparkles,
  Send,
  Trash2,
  FileText,
  ChevronDown,
  ChevronUp,
  Database,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  context?: ChatResponse["context_used"];
  sourceDocName?: string;
}

interface AssistantChatProps {
  initialDocId?: string;
}

export default function AssistantChat({
  initialDocId,
}: AssistantChatProps) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>(initialDocId || "");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputQuery, setInputQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedContextId, setExpandedContextId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const msgCounterRef = useRef(1);

  const activeDocId = selectedDocId || initialDocId;

  // Load documents
  useEffect(() => {
    let isMounted = true;
    fetchDocuments().then((docs) => {
      if (!isMounted) return;
      setDocuments(docs);
      if (initialDocId) {
        setSelectedDocId(initialDocId);
      } else if (docs.length > 0) {
        setSelectedDocId((prev) => prev || docs[0].document_id);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [initialDocId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const currentDoc = documents.find((d) => d.document_id === activeDocId) || documents[0];

  const starterQuestions = [
    "What key credentials and names appear in this document?",
    "Are there any detected tampering anomalies or layout inconsistencies?",
    "Summarize all structural dates, marks, and registration numbers.",
    "Does the typography and layout follow a uniform template?",
  ];

  const handleSend = async (queryText?: string) => {
    const q = (queryText || inputQuery).trim();
    if (!q || loading) return;

    const targetDocId = activeDocId || documents[0]?.document_id;
    if (!targetDocId) {
      alert("Please upload at least one document to ask forensic questions.");
      return;
    }

    msgCounterRef.current += 1;
    const userMsgId = `user-msg-${msgCounterRef.current}`;

    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: "user",
        content: q,
        timestamp: "Just now",
      },
    ]);
    setInputQuery("");
    setLoading(true);

    try {
      const res = await askAssistant(targetDocId, q);
      msgCounterRef.current += 1;
      const asstMsgId = `asst-msg-${msgCounterRef.current}`;
      setMessages((prev) => [
        ...prev,
        {
          id: asstMsgId,
          role: "assistant",
          content: res.answer,
          timestamp: "Just now",
          context: res.context_used,
          sourceDocName: currentDoc?.filename || "Target Document",
        },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      msgCounterRef.current += 1;
      setMessages((prev) => [
        ...prev,
        {
          id: `asst-err-${msgCounterRef.current}`,
          role: "assistant",
          content: `Unable to retrieve forensic answer: ${msg}`,
          timestamp: "Just now",
          sourceDocName: currentDoc?.filename,
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col h-[calc(100vh-5.5rem)]">
      {/* Top Header & Document Context Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              RAG Vector Assistant
            </span>
            <span className="text-zinc-300 dark:text-zinc-700">•</span>
            <span className="text-xs text-zinc-500">ChromaDB + Groq LLM</span>
          </div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
            Forensic Intelligence Assistant
          </h2>
        </div>

        {/* Target Document Focus Switcher */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Document Focus:</span>
          <select
            value={activeDocId}
            onChange={(e) => setSelectedDocId(e.target.value)}
            className="h-8 px-2.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-600 max-w-[220px] truncate shadow-2xs"
          >
            {documents.map((d) => (
              <option key={d.document_id} value={d.document_id}>
                {d.filename}
              </option>
            ))}
          </select>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearChat}
              className="h-8 px-2.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1 transition-colors border border-zinc-200/80 dark:border-zinc-800 shadow-2xs"
              title="Clear Thread"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Main Conversation Stream */}
      <div className="flex-1 overflow-y-auto py-6 pr-2 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center my-auto py-16 text-center max-w-xl mx-auto space-y-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Bot className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Ask Questions Grounded in {currentDoc?.filename || "Your Document"}
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                Queries search ChromaDB vector embeddings and retrieve exact chunks, layout metrics, and
                compression artifacts for analysis.
              </p>
            </div>

            {/* Clickable Starter Prompt Pills */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full pt-2">
              {starterQuestions.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSend(q)}
                  className="p-3 text-left rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-blue-500 dark:hover:border-blue-500 text-xs text-zinc-700 dark:text-zinc-300 transition-colors shadow-2xs flex items-start gap-2 group"
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                  <span className="leading-snug">{q}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => {
            const isUser = m.role === "user";
            return (
              <div
                key={m.id}
                className={`flex gap-3 max-w-[85%] ${
                  isUser ? "ml-auto flex-row-reverse" : "mr-auto flex-row"
                }`}
              >
                {/* Avatar Icon */}
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-semibold ${
                    isUser
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
                  }`}
                >
                  {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                </div>

                {/* Message Bubble Card */}
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div
                    className={`p-4 rounded-xl border text-xs leading-relaxed ${
                      isUser
                        ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                        : "bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-800 shadow-2xs"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>

                    {/* Source Tag */}
                    {m.sourceDocName && !isUser && (
                      <div className="mt-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-1.5 text-[10px] text-zinc-400">
                        <FileText className="w-3 h-3 text-zinc-400" />
                        <span>Source: {m.sourceDocName}</span>
                      </div>
                    )}
                  </div>

                  {/* Context Citations Accordion */}
                  {m.context && m.context.length > 0 && (
                    <div className="pl-1">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedContextId(expandedContextId === m.id ? null : m.id)
                        }
                        className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      >
                        <Database className="w-3 h-3 text-zinc-400" />
                        <span>
                          {expandedContextId === m.id ? "Hide" : "Show"}{" "}
                          {m.context.length} Referenced ChromaDB Chunks
                        </span>
                        {expandedContextId === m.id ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </button>

                      {expandedContextId === m.id && (
                        <div className="mt-2 space-y-2 p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs">
                          {m.context.map((chunk, cIdx) => (
                            <div
                              key={cIdx}
                              className="p-2.5 rounded bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 space-y-1"
                            >
                              <div className="flex items-center justify-between text-[10px] text-zinc-400">
                                <span className="font-mono">Chunk #{chunk.chunk_id?.slice(0, 8) || cIdx + 1}</span>
                                <span>Match Distance: {(chunk.distance || 0).toFixed(3)}</span>
                              </div>
                              <p className="text-zinc-700 dark:text-zinc-300 text-[11px] italic">
                                &ldquo;{chunk.text}&rdquo;
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Loading Indicator */}
        {loading && (
          <div className="flex gap-3 max-w-[80%] items-center">
            <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 border border-blue-200 dark:border-blue-800 flex items-center justify-center">
              <Bot className="w-3.5 h-3.5 animate-spin" />
            </div>
            <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs flex items-center gap-2 text-xs text-zinc-500">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping" />
              <span>Querying ChromaDB vector index &amp; Groq LLM...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Pinned Bottom Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="pt-2 flex-shrink-0"
      >
        <div className="relative flex items-center rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs focus-within:ring-1 focus-within:ring-blue-600 focus-within:border-blue-600 p-1.5 transition-all">
          <input
            ref={inputRef}
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            disabled={loading}
            placeholder={`Ask a question about ${currentDoc?.filename || "this document"}...`}
            className="flex-1 bg-transparent py-1.5 px-3 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
          />

          <button
            type="submit"
            disabled={!inputQuery.trim() || loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg shadow-2xs transition-colors"
          >
            <span>Ask</span>
            <Send className="w-3 h-3" />
          </button>
        </div>
      </form>
    </div>
  );
}
