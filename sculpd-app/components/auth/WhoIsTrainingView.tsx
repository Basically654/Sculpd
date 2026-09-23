// components/auth/WhoIsTrainingView.tsx
"use client";

import React, { useState } from "react";
import { SafeUser, AvatarColor } from "@/types/models";
import { useUser } from "./UserContext";
import PinPadModal from "./PinPadModal";
import AddProfileModal from "./AddProfileModal";

const COLOR_MAP: Record<AvatarColor, { border: string; bg: string; text: string }> = {
  emerald: { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-800" },
  amber: { border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-800" },
  violet: { border: "border-violet-200", bg: "bg-violet-50", text: "text-violet-800" },
  cyan: { border: "border-cyan-200", bg: "bg-cyan-50", text: "text-cyan-800" },
  rose: { border: "border-rose-200", bg: "bg-rose-50", text: "text-rose-800" },
  blue: { border: "border-blue-200", bg: "bg-blue-50", text: "text-blue-800" },
  fuchsia: { border: "border-fuchsia-200", bg: "bg-fuchsia-50", text: "text-fuchsia-800" },
};

export default function WhoIsTrainingView() {
  const { allProfiles, signIn, createProfile, isLoading } = useUser();
  const [selectedUser, setSelectedUser] = useState<SafeUser | null>(null);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const handleProfileClick = (user: SafeUser) => {
    setSelectedUser(user);
    setIsPinModalOpen(true);
  };

  const handleVerifyPin = async (pin: string) => {
    if (!selectedUser) return { success: false, error: "No profile selected" };
    return await signIn(selectedUser.id, pin);
  };

  const handlePinSuccess = () => {
    setIsPinModalOpen(false);
    setSelectedUser(null);
  };

  const handleCreateProfile = async (
    name: string,
    pin: string,
    color: AvatarColor,
    bodyweight?: number
  ) => {
    const newUser = await createProfile(name, pin, color, bodyweight);
    setSelectedUser(newUser);
    setIsPinModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#fafaf8] text-zinc-900 flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-800 border-t-transparent animate-spin mb-4" />
        <p className="text-xs font-mono uppercase tracking-widest text-stone-500">
          Loading Profiles...
        </p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#fafaf8] text-zinc-900 p-6 font-sans flex flex-col justify-between max-w-md mx-auto w-full">
      {/* Brand Header */}
      <header className="pt-8 pb-4 text-center">
        <h1 className="text-3xl font-black tracking-tight text-zinc-900 uppercase">
          SCULP’D
        </h1>
        <p className="text-xs font-semibold text-stone-500 mt-1 uppercase tracking-widest">
          Who’s training?
        </p>
      </header>

      {/* Profiles Grid / List */}
      <div className="flex-1 flex flex-col justify-center space-y-3 my-auto w-full py-4">
        {allProfiles.length === 0 ? (
          <div className="text-center py-10 px-6 rounded-2xl bg-white border border-stone-200 shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-500 text-lg mx-auto mb-3">
              🏋️
            </div>
            <h2 className="text-base font-bold text-zinc-900">
              No profiles found
            </h2>
            <p className="text-xs text-stone-500 mt-1 mb-6 leading-relaxed max-w-xs mx-auto">
              Create your local profile to start tracking workouts with private device storage.
            </p>
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="py-3 px-6 rounded-xl bg-zinc-900 text-white font-bold uppercase text-xs tracking-wider hover:bg-zinc-800 active:scale-95 transition-all shadow-sm cursor-pointer"
            >
              + Create First Profile
            </button>
          </div>
        ) : (
          <>
            {allProfiles.map((user) => {
              const theme = COLOR_MAP[user.avatarColor] || COLOR_MAP.emerald;
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => handleProfileClick(user)}
                  className="w-full p-4 rounded-xl bg-white border border-stone-200 hover:border-stone-300 hover:shadow-sm active:scale-[0.99] transition-all duration-150 flex items-center justify-between group text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`w-11 h-11 rounded-full ${theme.bg} border ${theme.border} ${theme.text} flex items-center justify-center font-bold text-base shadow-xs`}
                    >
                      {user.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-zinc-900 tracking-tight">
                        {user.displayName}
                      </h2>
                      <span className="text-[11px] text-stone-500 tracking-wide">
                        Tap to unlock
                      </span>
                    </div>
                  </div>

                  <div className="w-8 h-8 rounded-lg bg-stone-50 border border-stone-200 flex items-center justify-center text-stone-400 group-hover:text-zinc-700 transition-colors">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="w-4 h-4"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8.25 4.5l7.5 7.5-7.5 7.5"
                      />
                    </svg>
                  </div>
                </button>
              );
            })}

            {/* Add Profile Button */}
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="w-full p-3.5 rounded-xl bg-white hover:bg-stone-50 border border-dashed border-stone-300 text-stone-600 hover:text-zinc-900 active:scale-[0.99] transition-all flex items-center justify-center gap-2 font-medium text-xs uppercase tracking-wider mt-2 cursor-pointer shadow-xs"
            >
              <span>+</span>
              <span>Add Profile</span>
            </button>
          </>
        )}
      </div>

      {/* Footer */}
      <footer className="text-center pt-4 pb-2">
        <p className="text-[10px] font-mono tracking-widest text-stone-400 uppercase">
          Sculp’d • Local-First Architecture
        </p>
      </footer>

      {/* PIN Pad Modal */}
      {selectedUser && (
        <PinPadModal
          user={selectedUser}
          isOpen={isPinModalOpen}
          onClose={() => {
            setIsPinModalOpen(false);
            setSelectedUser(null);
          }}
          onSuccess={handlePinSuccess}
          onVerifyPin={handleVerifyPin}
        />
      )}

      {/* Add Profile Modal */}
      <AddProfileModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onCreate={handleCreateProfile}
      />
    </main>
  );
}
