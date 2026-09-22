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

    // Auto-submit when reaching 4 digits
    if (nextPin.length === 4) {
      setIsVerifying(true);
      const result = await onVerifyPin(nextPin);
      setIsVerifying(false);

      if (result.success) {
        setPin("");
        onSuccess();
      } else {
        setErrorMsg(result.error || "Incorrect PIN");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-xs bg-white border border-stone-200 rounded-3xl p-6 shadow-xl flex flex-col items-center">
        {/* Profile Avatar Header */}
        <div className="w-14 h-14 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center text-xl font-bold text-zinc-900 mb-2.5 shadow-xs">
          {user.displayName.charAt(0).toUpperCase()}
        </div>

        <h3 className="text-base font-bold text-zinc-900 tracking-tight">
          {user.displayName}
        </h3>
        <p className="text-xs text-stone-500 font-medium mt-0.5">
          Enter 4-digit PIN
        </p>

        {/* PIN Dots Indicator */}
        <div className="flex gap-3 my-5">
          {[0, 1, 2, 3].map((idx) => {
            const isFilled = pin.length > idx;
            return (
              <div
                key={idx}
                className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                  isFilled
                    ? "bg-zinc-900 scale-105"
                    : "bg-stone-100 border border-stone-300"
                }`}
              />
            );
          })}
        </div>

        {/* Error message */}
        <div className="h-5 mb-2">
          {errorMsg && (
            <p className="text-xs font-semibold text-rose-600 text-center">
              {errorMsg}
            </p>
          )}
        </div>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2.5 w-full max-w-[240px]">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
            <button
              key={num}
              type="button"
              disabled={isVerifying}
              onClick={() => handleDigit(num)}
              className="h-13 rounded-xl bg-stone-50 border border-stone-200 text-xl font-bold text-zinc-800 hover:bg-stone-100 hover:text-zinc-900 active:scale-95 transition-all flex items-center justify-center touch-manipulation select-none cursor-pointer shadow-xs"
            >
              {num}
            </button>
          ))}

          <button
            type="button"
            disabled={isVerifying || pin.length === 0}
            onClick={handleClear}
            className="h-13 rounded-xl text-xs font-semibold text-stone-400 hover:text-stone-700 active:scale-95 transition-all flex items-center justify-center uppercase select-none cursor-pointer"
          >
            Clear
          </button>

          <button
            key="0"
            type="button"
            disabled={isVerifying}
            onClick={() => handleDigit("0")}
            className="h-13 rounded-xl bg-stone-50 border border-stone-200 text-xl font-bold text-zinc-800 hover:bg-stone-100 hover:text-zinc-900 active:scale-95 transition-all flex items-center justify-center touch-manipulation select-none cursor-pointer shadow-xs"
          >
            0
          </button>

          <button
            type="button"
            disabled={isVerifying || pin.length === 0}
            onClick={handleDelete}
            className="h-13 rounded-xl text-xs font-semibold text-stone-500 hover:text-stone-800 active:scale-95 transition-all flex items-center justify-center select-none cursor-pointer"
          >
            ⌫
          </button>
        </div>

        {/* Cancel Button */}
        <button
          type="button"
          onClick={onClose}
          className="mt-5 text-xs text-stone-400 hover:text-stone-600 font-medium cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
