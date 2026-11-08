"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  DocumentRecord,
  fetchDocuments,
  askAssistant,
  ChatResponse,
} from "@/lib/api";

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
      if (!selectedDocId && !initialDocId && docs.length > 0) {
        setSelectedDocId(docs[0].document_id);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [selectedDocId, initialDocId]);

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
    const now = "Just now";

    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: "user",
        content: q,
        timestamp: now,
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
    <div className="w-full max-w-[1440px] mx-auto px-6 lg:px-10 py-6 flex flex-col h-[calc(100vh-6.5rem)]">
      {/* Top Header & Document Context Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-outline-variant/30 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center text-on-primary shadow-xs">
            <span className="material-symbols-outlined text-[22px]">smart_toy</span>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-semibold">
                RAG Document Intelligence
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="font-label-sm text-label-sm text-primary font-medium">ChromaDB + Groq</span>
            </div>
            <h1 className="font-headline-md text-headline-md text-on-surface tracking-tight font-semibold">
              Forensic Document Assistant
            </h1>
          </div>
        </div>

        {/* Target Document Selector & Actions */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-label-sm text-label-sm text-secondary font-medium">Focus:</span>
            <select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="px-3.5 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface font-label-md text-label-md shadow-xs focus:outline-none focus:border-primary max-w-[260px] truncate"
            >
              {documents.map((d) => (
                <option key={d.document_id} value={d.document_id}>
                  {d.filename}
                </option>
              ))}
            </select>
          </div>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearChat}
              className="px-3 py-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-secondary hover:text-on-surface transition-colors font-label-md text-label-md flex items-center gap-1.5 border border-outline-variant/30"
              title="Clear Conversation"
            >
              <span className="material-symbols-outlined text-[17px]">delete_sweep</span>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Chat Messages Workspace */}
      <div className="flex-1 overflow-y-auto py-6 pr-2 flex flex-col gap-5">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center my-auto py-12 text-center max-w-2xl mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-surface-container-low flex items-center justify-center text-primary mb-4 border border-outline-variant/20 shadow-xs">
              <span className="material-symbols-outlined text-[30px]">question_answer</span>
            </div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold mb-2">
              Ask Forensic Questions About{" "}
              <span className="text-primary">{currentDoc?.filename || "Your Document"}</span>
            </h2>
            <p className="font-body-md text-body-md text-secondary leading-relaxed mb-8">
              The Assistant performs semantic vector search over ChromaDB chunks and validates layout consistency,
              extracted credentials, and detected anomalies.
            </p>

            {/* Suggested Starter Questions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
              {starterQuestions.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSend(q)}
                  className="p-3.5 text-left rounded-xl bg-surface-container-lowest hover:bg-surface-container-low border border-outline-variant/30 shadow-xs transition-all text-on-surface hover:border-primary/50 group flex items-start gap-2.5"
                >
                  <span className="material-symbols-outlined text-primary text-[18px] mt-0.5 group-hover:scale-110 transition-transform">
                    chat_bubble
                  </span>
                  <span className="font-body-sm text-body-sm leading-snug">{q}</span>
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
                  isUser ? "self-end flex-row-reverse" : "self-start flex-row"
                }`}
              >
                {/* Avatar Icon */}
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 shadow-xs ${
                    isUser
                      ? "bg-primary-container text-on-primary"
                      : "bg-surface-container-low text-primary border border-outline-variant/30"
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {isUser ? "person" : "smart_toy"}
                  </span>
                </div>

                {/* Message Bubble */}
                <div className="flex flex-col gap-1.5">
                  <div
                    className={`rounded-2xl p-4 shadow-xs text-on-surface ${
                      isUser
                        ? "bg-primary-container text-on-primary rounded-tr-xs"
                        : "bg-surface-container-lowest border border-outline-variant/30 rounded-tl-xs"
                    }`}
                  >
                    <p className="font-body-md text-body-md whitespace-pre-wrap leading-relaxed">
                      {m.content}
                    </p>

                    {/* Source Document Tag */}
                    {m.sourceDocName && !isUser && (
                      <div className="mt-2.5 pt-2 border-t border-outline-variant/20 flex items-center gap-1.5 text-secondary font-label-sm text-label-sm">
                        <span className="material-symbols-outlined text-[14px]">description</span>
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
                        className="inline-flex items-center gap-1.5 text-secondary hover:text-primary font-label-sm text-label-sm transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[15px]">data_object</span>
                        <span>
                          {expandedContextId === m.id ? "Hide" : "Show"}{" "}
                          {m.context.length} Grounded ChromaDB Context Chunks
                        </span>
                        <span className="material-symbols-outlined text-[13px]">
                          {expandedContextId === m.id ? "expand_less" : "expand_more"}
                        </span>
                      </button>

                      {expandedContextId === m.id && (
                        <div className="mt-2 flex flex-col gap-2 p-3 bg-surface-container-low rounded-xl border border-outline-variant/30">
                          {m.context.map((chunk, cIdx) => (
                            <div
                              key={cIdx}
                              className="p-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/20 text-body-sm font-body-sm text-on-surface-variant flex flex-col gap-1"
                            >
                              <div className="flex items-center justify-between text-secondary font-label-sm text-label-sm">
                                <span className="font-mono">Chunk #{chunk.chunk_id?.slice(0, 8) || cIdx + 1}</span>
                                <span>Similarity Score: {(1 - (chunk.distance || 0)).toFixed(2)}</span>
                              </div>
                              <p className="text-on-surface italic leading-relaxed">&ldquo;{chunk.text}&rdquo;</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <span
                    className={`font-label-sm text-label-sm text-secondary px-1 ${
                      isUser ? "text-right" : "text-left"
                    }`}
                  >
                    {m.timestamp}
                  </span>
                </div>
              </div>
            );
          })
        )}

        {/* Loading Indicator */}
        {loading && (
          <div className="flex gap-3 max-w-[80%] self-start items-center">
            <div className="w-8 h-8 rounded-lg bg-surface-container-low text-primary border border-outline-variant/30 flex items-center justify-center flex-shrink-0 shadow-xs">
              <span className="material-symbols-outlined text-[18px] animate-spin">refresh</span>
            </div>
            <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl rounded-tl-xs px-4 py-3 shadow-xs flex items-center gap-2 text-secondary">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
              </div>
              <span className="font-label-md text-label-md text-on-surface-variant ml-2">
                Querying ChromaDB vector index & Groq LLM...
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Starter Chips Bar if messages exist */}
      {messages.length > 0 && !loading && (
        <div className="flex items-center gap-2 overflow-x-auto py-2 flex-shrink-0 no-scrollbar">
          <span className="font-label-sm text-label-sm text-secondary font-medium flex-shrink-0">
            Suggested:
          </span>
          {starterQuestions.slice(0, 3).map((q, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSend(q)}
              className="px-3 py-1 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface font-label-sm text-label-sm whitespace-nowrap transition-colors border border-outline-variant/20"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Fixed Bottom Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="pt-2 flex-shrink-0"
      >
        <div className="relative flex items-center rounded-2xl bg-surface-container-lowest border border-outline-variant/40 shadow-sm focus-within:border-primary focus-within:ring-1 focus-within:ring-primary p-1.5 transition-all">
          <div className="pl-3 pr-2 text-secondary flex items-center">
            <span className="material-symbols-outlined text-[20px]">search</span>
          </div>

          <input
            ref={inputRef}
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            disabled={loading}
            placeholder={`Ask a question about ${currentDoc?.filename || "this document"}...`}
            className="flex-1 bg-transparent py-2.5 px-1 font-body-md text-body-md text-on-surface placeholder:text-secondary focus:outline-none"
          />

          <button
            type="submit"
            disabled={!inputQuery.trim() || loading}
            className="px-4 py-2.5 rounded-xl bg-primary-container text-on-primary hover:bg-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-label-md text-label-md font-semibold flex items-center gap-1.5 shadow-xs"
          >
            <span>Ask</span>
            <span className="material-symbols-outlined text-[17px]">send</span>
          </button>
        </div>
      </form>
    </div>
  );
}
