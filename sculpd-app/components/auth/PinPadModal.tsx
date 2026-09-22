// components/auth/PinPadModal.tsx
"use client";

import React, { useState } from "react";
import { SafeUser } from "@/types/models";

interface PinPadModalProps {
  user: SafeUser;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onVerifyPin: (pin: string) => Promise<{ success: boolean; error?: string }>;
}

export default function PinPadModal({
  user,
  isOpen,
  onClose,
  onSuccess,
  onVerifyPin,
}: PinPadModalProps) {
  const [pin, setPin] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  if (!isOpen) return null;

  const handleDigit = async (digit: string) => {
    if (isVerifying || pin.length >= 6) return;

    const nextPin = pin + digit;
    setPin(nextPin);
    setErrorMsg(null);

    // Auto-submit when reaching 4 digits (standard PIN length)
    if (nextPin.length === 4) {
      setIsVerifying(true);
      const result = await onVerifyPin(nextPin);
      setIsVerifying(false);

      if (result.success) {
        setPin("");
        onSuccess();
      } else {
        setErrorMsg(result.error || "Incorrect PIN");
        // Haptic feedback if available
        if (typeof window !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate([100, 50, 100]);
        }
        setPin("");
      }
    }
  };

  const handleDelete = () => {
    if (isVerifying || pin.length === 0) return;
    setPin(pin.slice(0, -1));
    setErrorMsg(null);
  };

  const handleClear = () => {
    setPin("");
    setErrorMsg(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-xs bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center">
        {/* Profile Avatar Header */}
        <div className="w-16 h-16 rounded-full bg-zinc-900 border-2 border-emerald-500/80 flex items-center justify-center text-2xl font-black text-emerald-400 mb-3 shadow-lg shadow-emerald-500/10">
          {user.displayName.charAt(0).toUpperCase()}
        </div>

        <h3 className="text-lg font-black uppercase text-zinc-100 tracking-tight">
          {user.displayName}
        </h3>
        <p className="text-xs text-zinc-500 font-medium mt-0.5">
          Enter 4-digit PIN
        </p>

        {/* PIN Dots Indicator */}
        <div className="flex gap-3 my-6">
          {[0, 1, 2, 3].map((idx) => {
            const isFilled = pin.length > idx;
            return (
              <div
                key={idx}
                className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                  isFilled
                    ? "bg-emerald-400 scale-110 shadow-sm shadow-emerald-400/50"
                    : "bg-zinc-800 border border-zinc-700"
                }`}
              />
            );
          })}
        </div>

        {/* Error message */}
        <div className="h-5 mb-2">
          {errorMsg && (
            <p className="text-xs font-semibold text-rose-400 animate-bounce text-center">
              {errorMsg}
            </p>
          )}
        </div>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[240px]">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
            <button
              key={num}
              type="button"
              disabled={isVerifying}
              onClick={() => handleDigit(num)}
              className="h-14 rounded-2xl bg-zinc-900/90 border border-zinc-800 text-xl font-bold text-zinc-200 hover:bg-zinc-800 hover:text-white active:scale-95 transition-all flex items-center justify-center touch-manipulation select-none"
            >
              {num}
            </button>
          ))}

          <button
            type="button"
            disabled={isVerifying || pin.length === 0}
            onClick={handleClear}
            className="h-14 rounded-2xl bg-zinc-900/40 text-xs font-semibold text-zinc-500 hover:text-zinc-300 active:scale-95 transition-all flex items-center justify-center uppercase select-none"
          >
            Clear
          </button>

          <button
            key="0"
            type="button"
            disabled={isVerifying}
            onClick={() => handleDigit("0")}
            className="h-14 rounded-2xl bg-zinc-900/90 border border-zinc-800 text-xl font-bold text-zinc-200 hover:bg-zinc-800 hover:text-white active:scale-95 transition-all flex items-center justify-center touch-manipulation select-none"
          >
            0
          </button>

          <button
            type="button"
            disabled={isVerifying || pin.length === 0}
            onClick={handleDelete}
            className="h-14 rounded-2xl bg-zinc-900/40 text-sm font-semibold text-zinc-400 hover:text-zinc-200 active:scale-95 transition-all flex items-center justify-center select-none"
          >
            ⌫
          </button>
        </div>

        {/* Cancel Button */}
        <button
          type="button"
          onClick={() => {
            setPin("");
            setErrorMsg(null);
            onClose();
          }}
          className="mt-6 text-xs text-zinc-500 hover:text-zinc-300 uppercase tracking-wider font-semibold py-1 px-4"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
