// components/auth/WhoIsTrainingView.tsx
"use client";

import React, { useState } from "react";
import { SafeUser, AvatarColor } from "@/types/models";
import { useUser } from "./UserContext";
import PinPadModal from "./PinPadModal";
import AddProfileModal from "./AddProfileModal";

const COLOR_MAP: Record<AvatarColor, { border: string; bg: string; text: string }> = {
  emerald: { border: "border-emerald-500/60", bg: "bg-emerald-500/10", text: "text-emerald-400" },
  amber: { border: "border-amber-500/60", bg: "bg-amber-500/10", text: "text-amber-400" },
  violet: { border: "border-violet-500/60", bg: "bg-violet-500/10", text: "text-violet-400" },
  cyan: { border: "border-cyan-500/60", bg: "bg-cyan-500/10", text: "text-cyan-400" },
  rose: { border: "border-rose-500/60", bg: "bg-rose-500/10", text: "text-rose-400" },
  blue: { border: "border-blue-500/60", bg: "bg-blue-500/10", text: "text-blue-400" },
  fuchsia: { border: "border-fuchsia-500/60", bg: "bg-fuchsia-500/10", text: "text-fuchsia-400" },
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
    color: AvatarColor
  ) => {
    const newUser = await createProfile(name, pin, color);
    // Automatically prompt PIN or log in
    setSelectedUser(newUser);
    setIsPinModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mb-4" />
        <p className="text-xs font-mono uppercase tracking-widest text-zinc-500">
          Loading Profiles...
        </p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-6 font-sans flex flex-col justify-between max-w-md mx-auto w-full">
      {/* Brand Header */}
      <header className="pt-8 pb-4 text-center">
        <h1 className="text-3xl font-black tracking-tighter text-zinc-100 uppercase">
          SCULP’D
        </h1>
        <p className="text-xs font-semibold text-emerald-400 mt-1 uppercase tracking-widest">
          Who’s training?
        </p>
      </header>

      {/* Profiles Grid / List */}
      <div className="flex-1 flex flex-col justify-center space-y-3.5 my-auto w-full py-4">
        {allProfiles.length === 0 ? (
          <div className="text-center py-8 px-4 rounded-2xl bg-zinc-950 border border-zinc-900">
            <p className="text-sm font-semibold text-zinc-300">
              No profiles found
            </p>
            <p className="text-xs text-zinc-500 mt-1 mb-6">
              Create your profile to start tracking workouts with private local storage.
            </p>
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="py-3 px-6 rounded-xl bg-emerald-500 text-black font-black uppercase text-xs tracking-wider hover:bg-emerald-400 active:scale-95 transition-all shadow-lg shadow-emerald-500/20"
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
                  className={`w-full p-4 rounded-2xl bg-zinc-950 border ${theme.border} hover:bg-zinc-900/60 active:scale-[0.98] transition-all duration-200 flex items-center justify-between group text-left`}
                >
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`w-12 h-12 rounded-full ${theme.bg} border-2 ${theme.border} ${theme.text} flex items-center justify-center font-black text-lg`}
                    >
                      {user.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-base font-black text-zinc-100 tracking-tight uppercase group-hover:text-white">
                        {user.displayName}
                      </h2>
                      <span className="text-[10px] font-mono text-zinc-500 tracking-wide uppercase">
                        Private Profile
                      </span>
                    </div>
                  </div>

                  <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 group-hover:text-zinc-300">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
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
              className="w-full p-3.5 rounded-2xl bg-zinc-900/40 border border-dashed border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-wider mt-2"
            >
              <span>+</span>
              <span>Add Profile</span>
            </button>
          </>
        )}
      </div>

      {/* Footer */}
      <footer className="text-center pt-4 pb-2">
        <p className="text-[10px] font-mono tracking-widest text-zinc-600 uppercase">
          Sculp’d 2.0 • Local-First PWA Core
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
