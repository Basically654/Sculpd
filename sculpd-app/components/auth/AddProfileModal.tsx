// components/auth/AddProfileModal.tsx
"use client";

import React, { useState } from "react";
import { AvatarColor } from "@/types/models";

interface AddProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (
    displayName: string,
    pin: string,
    avatarColor: AvatarColor
  ) => Promise<void>;
}

const COLOR_OPTIONS: Array<{ name: AvatarColor; bg: string; border: string }> = [
  { name: "emerald", bg: "bg-emerald-500", border: "border-emerald-400" },
  { name: "amber", bg: "bg-amber-500", border: "border-amber-400" },
  { name: "violet", bg: "bg-violet-500", border: "border-violet-400" },
  { name: "cyan", bg: "bg-cyan-500", border: "border-cyan-400" },
  { name: "rose", bg: "bg-rose-500", border: "border-rose-400" },
  { name: "blue", bg: "bg-blue-500", border: "border-blue-400" },
];

export default function AddProfileModal({
  isOpen,
  onClose,
  onCreate,
}: AddProfileModalProps) {
  const [displayName, setDisplayName] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [avatarColor, setAvatarColor] = useState<AvatarColor>("emerald");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setErrorMsg("Please enter a display name.");
      return;
    }

    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      setErrorMsg("PIN must be exactly 4 digits.");
      return;
    }

    if (pin !== confirmPin) {
      setErrorMsg("PINs do not match.");
      return;
    }

    try {
      setIsSubmitting(true);
      await onCreate(trimmedName, pin, avatarColor);
      // Reset form
      setDisplayName("");
      setPin("");
      setConfirmPin("");
      setAvatarColor("emerald");
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to create profile.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-black uppercase text-zinc-100 tracking-tight">
            Add Profile
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold text-center">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Display Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Name
            </label>
            <input
              type="text"
              required
              maxLength={20}
              placeholder="e.g. Alex"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          {/* Avatar Accent Color */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Avatar Color
            </label>
            <div className="flex gap-2.5">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => setAvatarColor(c.name)}
                  className={`w-9 h-9 rounded-full ${c.bg} transition-all flex items-center justify-center ${
                    avatarColor === c.name
                      ? "ring-2 ring-white ring-offset-2 ring-offset-zinc-950 scale-105"
                      : "opacity-60 hover:opacity-100"
                  }`}
                >
                  {avatarColor === c.name && (
                    <span className="text-black text-xs font-black">✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* PIN Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                4-Digit PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                pattern="\d*"
                maxLength={4}
                placeholder="••••"
                required
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-center text-base tracking-widest text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                Confirm PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                pattern="\d*"
                maxLength={4}
                placeholder="••••"
                required
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-center text-base tracking-widest text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>

          <p className="text-[11px] text-zinc-500">
            PIN is stored locally using salted cryptographic hashes to isolate your personal workout history.
          </p>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 rounded-xl bg-emerald-500 text-black font-black uppercase text-sm tracking-wide hover:bg-emerald-400 active:scale-[0.98] transition-all disabled:opacity-50 mt-2"
          >
            {isSubmitting ? "Creating..." : "Save Profile"}
          </button>
        </form>
      </div>
    </div>
  );
}
