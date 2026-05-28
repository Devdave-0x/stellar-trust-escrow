"use client";

import { useState, useEffect, useCallback } from "react";

const NOTIFICATION_GROUPS = [
  {
    id: "milestone",
    label: "Milestone Releases",
    description: "Alerts when contract milestones are released or funded",
    channels: ["email", "sms", "push"],
  },
  {
    id: "dispute",
    label: "Dispute Updates",
    description: "Notifications for dispute filings, evidence, and resolutions",
    channels: ["email", "sms", "push"],
  },
  {
    id: "platform",
    label: "Platform Changes",
    description: "Product updates, maintenance windows, and policy changes",
    channels: ["email", "push"],
  },
  {
    id: "security",
    label: "Security Events",
    description: "Login alerts, wallet connects, and suspicious activity",
    channels: ["email", "sms", "push"],
  },
];

const CHANNEL_LABELS = { email: "Email", sms: "SMS", push: "Push" };

function Toggle({ checked, onChange, id, label }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      id={id}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${
        checked ? "bg-blue-600" : "bg-gray-600"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div
      role="alert"
      aria-live="polite"
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-5 py-3 text-sm font-medium shadow-lg transition-all ${
        type === "success"
          ? "bg-green-600 text-white"
          : "bg-red-600 text-white"
      }`}
    >
      <span>{type === "success" ? "✓" : "✗"}</span>
      <span>{message}</span>
      <button onClick={onClose} aria-label="Dismiss notification" className="ml-2 opacity-70 hover:opacity-100">✕</button>
    </div>
  );
}

const defaultPrefs = () =>
  Object.fromEntries(
    NOTIFICATION_GROUPS.map((g) => [
      g.id,
      Object.fromEntries(g.channels.map((c) => [c, true])),
    ])
  );

export default function NotificationSettingsPage() {
  const [prefs, setPrefs] = useState(defaultPrefs);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/profile/notification-preferences");
        if (res.ok) {
          const data = await res.json();
          setPrefs((prev) => ({ ...prev, ...data }));
        }
      } catch {}
    }
    load();
  }, []);

  const handleToggle = (groupId, channel, value) => {
    setPrefs((prev) => ({
      ...prev,
      [groupId]: { ...prev[groupId], [channel]: value },
    }));
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error();
      setToast({ message: "Notification preferences saved.", type: "success" });
    } catch {
      setToast({ message: "Failed to save. Please try again.", type: "error" });
    } finally {
      setSaving(false);
    }
  }, [prefs]);

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-10 text-gray-100">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Notification Settings</h1>
          <p className="mt-1 text-sm text-gray-400">
            Control how and when you receive alerts from Stellar Trust Escrow.
          </p>
        </header>

        <div className="space-y-4" role="region" aria-label="Notification preferences">
          {NOTIFICATION_GROUPS.map((group) => (
            <section
              key={group.id}
              aria-labelledby={`group-${group.id}-label`}
              className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm"
            >
              <div className="mb-4">
                <h2
                  id={`group-${group.id}-label`}
                  className="font-medium text-white"
                >
                  {group.label}
                </h2>
                <p className="mt-0.5 text-xs text-gray-400">{group.description}</p>
              </div>
              <div className="flex flex-wrap gap-6">
                {group.channels.map((channel) => {
                  const toggleId = `toggle-${group.id}-${channel}`;
                  return (
                    <div key={channel} className="flex items-center gap-3">
                      <Toggle
                        id={toggleId}
                        checked={prefs[group.id]?.[channel] ?? false}
                        onChange={(val) => handleToggle(group.id, channel, val)}
                        label={`${CHANNEL_LABELS[channel]} notifications for ${group.label}`}
                      />
                      <label
                        htmlFor={toggleId}
                        className="cursor-pointer select-none text-sm text-gray-300"
                      >
                        {CHANNEL_LABELS[channel]}
                      </label>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-8 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            aria-busy={saving}
            className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Preferences"}
          </button>
        </div>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </main>
  );
}
