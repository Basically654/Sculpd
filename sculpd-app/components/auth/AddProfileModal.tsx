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
    avatarColor: AvatarColor,
    bodyweight?: number
  ) => Promise<void>;
}

const COLOR_OPTIONS: Array<{ name: AvatarColor; bg: string }> = [
  { name: "emerald", bg: "bg-emerald-600" },
  { name: "amber", bg: "bg-amber-600" },
  { name: "violet", bg: "bg-violet-600" },
  { name: "cyan", bg: "bg-teal-600" },
  { name: "rose", bg: "bg-rose-600" },
  { name: "blue", bg: "bg-blue-600" },
];

export default function AddProfileModal({
  isOpen,
  onClose,
  onCreate,
}: AddProfileModalProps) {
  const [displayName, setDisplayName] = useState("");
  const [bodyweight, setBodyweight] = useState("");
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

    const parsedBw = bodyweight.trim() ? parseFloat(bodyweight) : undefined;
    if (parsedBw !== undefined && (isNaN(parsedBw) || parsedBw <= 0)) {
      setErrorMsg("Bodyweight must be a positive number.");
      return;
    }

    try {
      setIsSubmitting(true);
      await onCreate(trimmedName, pin, avatarColor, parsedBw);
      // Reset form
      setDisplayName("");
      setBodyweight("");
      setPin("");
      setConfirmPin("");
      setAvatarColor("emerald");
      onClose();
    } catch (err: any) {
      const msg = String(err?.message || "").toLowerCase();
      if (
        msg.includes("unable to open database file") ||
        msg.includes("open database file on disk") ||
        err?.name === "OpenFailedError" ||
        err?.name === "UnknownError"
      ) {
        setErrorMsg(
          "Storage error on this device. Please ensure Private Browsing is turned off or reload the page."
        );
      } else {
        setErrorMsg(err?.message || "Failed to create profile.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-white border border-stone-200 rounded-3xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-zinc-900 tracking-tight">
            Add Athlete Profile
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-stone-100 text-stone-500 hover:text-zinc-900 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium text-center">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Display Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
              Name
            </label>
            <input
              type="text"
              required
              maxLength={20}
              placeholder="e.g. Alex"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm text-zinc-900 placeholder-stone-400 focus:outline-none focus:border-zinc-900 focus:bg-white transition-colors"
            />
          </div>

          {/* Optional Bodyweight */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
              Bodyweight (lbs) <span className="text-[10px] text-stone-400 font-normal lowercase">(optional)</span>
            </label>
            <input
              type="number"
              step="any"
              min="0"
              placeholder="e.g. 195"
              value={bodyweight}
              onChange={(e) => setBodyweight(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm text-zinc-900 placeholder-stone-400 focus:outline-none focus:border-zinc-900 focus:bg-white transition-colors"
            />
          </div>

          {/* Avatar Accent Color */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
              Profile Color
            </label>
            <div className="flex gap-2.5">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => setAvatarColor(c.name)}
                  className={`w-8 h-8 rounded-full ${c.bg} transition-all flex items-center justify-center cursor-pointer ${
                    avatarColor === c.name
                      ? "ring-2 ring-zinc-900 ring-offset-2 scale-105"
                      : "opacity-60 hover:opacity-100"
                  }`}
                >
                  {avatarColor === c.name && (
                    <span className="text-white text-xs font-bold">✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* PIN Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
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
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-center text-base font-mono tracking-widest text-zinc-900 placeholder-stone-400 focus:outline-none focus:border-zinc-900 focus:bg-white transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
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
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-center text-base font-mono tracking-widest text-zinc-900 placeholder-stone-400 focus:outline-none focus:border-zinc-900 focus:bg-white transition-colors"
              />
            </div>
          </div>

          <p className="text-[11px] text-stone-500 leading-relaxed">
            Your PIN is salted and hashed locally to protect your workout data.
          </p>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 rounded-xl bg-zinc-900 text-white font-bold uppercase text-xs tracking-wider hover:bg-zinc-800 active:scale-[0.98] transition-all disabled:opacity-50 mt-2 cursor-pointer shadow-xs"
          >
            {isSubmitting ? "Creating..." : "Save Profile"}
          </button>
        </form>
      </div>
    </div>
  );
}
