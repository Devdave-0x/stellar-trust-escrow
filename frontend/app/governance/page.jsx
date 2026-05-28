"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

// ─── Mock data (replace with on-chain contract calls) ──────────────────────
const MOCK_PROPOSALS = [
  {
    id: "prop-001",
    title: "Increase dispute resolution window to 14 days",
    description:
      "Extend the default dispute resolution period from 7 to 14 days to give arbitrators more time for complex cases.",
    status: "active",
    votesFor: 18420,
    votesAgainst: 4310,
    totalShares: 30000,
    endsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    proposer: "GABC...X7YZ",
    userVote: null,
  },
  {
    id: "prop-002",
    title: "Reduce platform fee from 1.5% to 1.0%",
    description: "Lower escrow service fees to improve competitiveness against centralized alternatives.",
    status: "active",
    votesFor: 9800,
    votesAgainst: 12200,
    totalShares: 30000,
    endsAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
    proposer: "GDEF...A3BC",
    userVote: null,
  },
  {
    id: "prop-003",
    title: "Add multi-sig arbitrator approval for disputes >$50k",
    description: "Require 3-of-5 arbitrator signatures for high-value dispute resolutions.",
    status: "passed",
    votesFor: 24100,
    votesAgainst: 3200,
    totalShares: 30000,
    endsAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    proposer: "GHIJ...K9LM",
    userVote: "for",
  },
  {
    id: "prop-004",
    title: "Emergency pause mechanism for security incidents",
    description: "Allow a 4-of-7 guardian council to pause contract interactions during active exploits.",
    status: "rejected",
    votesFor: 8000,
    votesAgainst: 19000,
    totalShares: 30000,
    endsAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    proposer: "GNOP...Q2RS",
    userVote: "against",
  },
];

const USER_SHARES = 450;
// ──────────────────────────────────────────────────────────────────────────

function useCountdown(isoDate) {
  const [display, setDisplay] = useState("");
  useEffect(() => {
    function calc() {
      const diff = new Date(isoDate) - Date.now();
      if (diff <= 0) return setDisplay("Ended");
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setDisplay(`${d}d ${h}h ${m}m`);
    }
    calc();
    const id = setInterval(calc, 60000);
    return () => clearInterval(id);
  }, [isoDate]);
  return display;
}

function VoteBar({ votesFor, votesAgainst, totalShares }) {
  const forPct = totalShares ? ((votesFor / totalShares) * 100).toFixed(1) : 0;
  const againstPct = totalShares ? ((votesAgainst / totalShares) * 100).toFixed(1) : 0;
  return (
    <div aria-label={`${forPct}% for, ${againstPct}% against`}>
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>For: {forPct}%</span>
        <span>Against: {againstPct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-700"
          style={{ width: `${forPct}%` }}
          role="progressbar"
          aria-valuenow={forPct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}

function ProposalCard({ proposal, onVote }) {
  const countdown = useCountdown(proposal.endsAt);
  const isActive = proposal.status === "active";
  const statusColors = {
    active: "bg-blue-500/20 text-blue-300",
    passed: "bg-green-500/20 text-green-300",
    rejected: "bg-red-500/20 text-red-300",
  };

  return (
    <article
      aria-labelledby={`prop-title-${proposal.id}`}
      className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition hover:border-white/20"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 id={`prop-title-${proposal.id}`} className="font-semibold text-white leading-snug">
          {proposal.title}
        </h3>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[proposal.status]}`}
          aria-label={`Status: ${proposal.status}`}
        >
          {proposal.status.charAt(0).toUpperCase() + proposal.status.slice(1)}
        </span>
      </div>

      <p className="mb-4 text-sm text-gray-400 leading-relaxed">{proposal.description}</p>

      <VoteBar
        votesFor={proposal.votesFor}
        votesAgainst={proposal.votesAgainst}
        totalShares={proposal.totalShares}
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
        <span>
          Proposed by <span className="font-mono text-gray-400">{proposal.proposer}</span>
        </span>
        <span aria-live="polite" aria-label={`Time remaining: ${countdown}`}>
          ⏱ {countdown}
        </span>
      </div>

      {isActive && (
        <div className="mt-4 flex gap-3" role="group" aria-label={`Vote on: ${proposal.title}`}>
          {["for", "against"].map((side) => (
            <button
              key={side}
              onClick={() => onVote(proposal.id, side)}
              disabled={!!proposal.userVote}
              aria-pressed={proposal.userVote === side}
              className={`flex-1 rounded-xl py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                side === "for"
                  ? "bg-green-600/30 text-green-300 hover:bg-green-600/50 focus:ring-green-500"
                  : "bg-red-600/30 text-red-300 hover:bg-red-600/50 focus:ring-red-500"
              } ${proposal.userVote === side ? "ring-2" : ""}`}
            >
              {side === "for" ? "✓ Vote For" : "✗ Vote Against"}
            </button>
          ))}
        </div>
      )}

      {proposal.userVote && (
        <p className="mt-3 text-center text-xs text-gray-500" aria-live="polite">
          You voted <strong className="text-gray-300">{proposal.userVote}</strong> with {USER_SHARES.toLocaleString()} shares.
        </p>
      )}
    </article>
  );
}

const CREATE_SCHEMA = {
  title: { label: "Title", placeholder: "Short, clear proposal title", maxLength: 80 },
  description: { label: "Description", placeholder: "Explain the change and its rationale (min 50 chars)", minLength: 50 },
};

function CreateProposalModal({ onClose, onCreate }) {
  const [form, setForm] = useState({ title: "", description: "" });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const e = {};
    if (!form.title.trim()) e.title = "Title is required.";
    else if (form.title.length > 80) e.title = "Max 80 characters.";
    if (form.description.length < 50) e.description = "Minimum 50 characters required.";
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) return setErrors(e);
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 900)); // simulate tx
    onCreate({ ...form, id: `prop-${Date.now()}`, status: "active", votesFor: 0, votesAgainst: 0, totalShares: 30000, endsAt: new Date(Date.now() + 7 * 86400000).toISOString(), proposer: "You", userVote: null });
    setSubmitting(false);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-gray-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 id="modal-title" className="text-lg font-semibold text-white">Create Proposal</h2>
          <button onClick={onClose} aria-label="Close modal" className="text-gray-400 hover:text-white">✕</button>
        </div>

        {Object.entries(CREATE_SCHEMA).map(([key, meta]) => (
          <div key={key} className="mb-4">
            <label htmlFor={`field-${key}`} className="mb-1.5 block text-sm font-medium text-gray-300">
              {meta.label}
            </label>
            {key === "description" ? (
              <textarea
                id={`field-${key}`}
                rows={4}
                placeholder={meta.placeholder}
                value={form[key]}
                onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                aria-describedby={errors[key] ? `err-${key}` : undefined}
                aria-invalid={!!errors[key]}
              />
            ) : (
              <input
                id={`field-${key}`}
                type="text"
                maxLength={meta.maxLength}
                placeholder={meta.placeholder}
                value={form[key]}
                onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                aria-describedby={errors[key] ? `err-${key}` : undefined}
                aria-invalid={!!errors[key]}
              />
            )}
            {errors[key] && (
              <p id={`err-${key}`} role="alert" className="mt-1 text-xs text-red-400">{errors[key]}</p>
            )}
          </div>
        ))}

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl border border-white/10 px-5 py-2 text-sm text-gray-300 hover:bg-white/5">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            aria-busy={submitting}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit Proposal"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GovernancePage() {
  const [proposals, setProposals] = useState(MOCK_PROPOSALS);
  const [filter, setFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState(null);

  const filtered = useMemo(
    () => (filter === "all" ? proposals : proposals.filter((p) => p.status === filter)),
    [proposals, filter]
  );

  const handleVote = useCallback((id, side) => {
    setProposals((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        return {
          ...p,
          votesFor: side === "for" ? p.votesFor + USER_SHARES : p.votesFor,
          votesAgainst: side === "against" ? p.votesAgainst + USER_SHARES : p.votesAgainst,
          userVote: side,
        };
      })
    );
    setToast(`Vote cast ${side === "for" ? "✓" : "✗"} successfully.`);
    setTimeout(() => setToast(null), 3500);
  }, []);

  const handleCreate = useCallback((proposal) => {
    setProposals((prev) => [proposal, ...prev]);
    setToast("Proposal submitted on-chain.");
    setTimeout(() => setToast(null), 3500);
  }, []);

  const tabs = ["all", "active", "passed", "rejected"];

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-10 text-gray-100">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Governance</h1>
            <p className="mt-1 text-sm text-gray-400">
              Your shares: <span className="font-semibold text-white">{USER_SHARES.toLocaleString()}</span>
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            + New Proposal
          </button>
        </header>

        {/* Filter tabs */}
        <div role="tablist" aria-label="Filter proposals" className="mb-6 flex gap-2 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={filter === t}
              onClick={() => setFilter(t)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                filter === t
                  ? "bg-blue-600 text-white"
                  : "bg-white/5 text-gray-400 hover:bg-white/10"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Proposal list */}
        <section aria-label="Proposal list" aria-live="polite">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-16">No proposals in this category.</p>
          ) : (
            <div className="space-y-4">
              {filtered.map((p) => (
                <ProposalCard key={p.id} proposal={p} onVote={handleVote} />
              ))}
            </div>
          )}
        </section>
      </div>

      {showCreate && (
        <CreateProposalModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 rounded-xl bg-gray-800 border border-white/10 px-5 py-3 text-sm text-white shadow-xl"
        >
          {toast}
        </div>
      )}
    </main>
  );
}
