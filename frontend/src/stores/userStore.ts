import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Artifact } from '../lib/types';

interface UserState {
  user: User | null;
  artifacts: Artifact[];
  isAuthenticated: boolean;
  isBrand: boolean;
  
  setUser: (user: User | null) => void;
  setArtifacts: (artifacts: Artifact[]) => void;
  addArtifact: (artifact: Artifact) => void;
  updateArtifact: (tagHash: string, updates: Partial<Artifact>) => void;
  logout: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      user: null,
      artifacts: [],
      isAuthenticated: false,
      isBrand: false,

      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
          isBrand: user?.role === 'brand',
        }),

      setArtifacts: (artifacts) => set({ artifacts }),

      addArtifact: (artifact) =>
        set((state) => ({
          artifacts: [...state.artifacts, artifact],
        })),

      updateArtifact: (tagHash, updates) =>
        set((state) => ({
          artifacts: state.artifacts.map((a) =>
            a.tagHash === tagHash ? { ...a, ...updates } : a
          ),
        })),

      logout: () => {
        localStorage.removeItem('onyx_token');
        set({
          user: null,
          artifacts: [],
          isAuthenticated: false,
          isBrand: false,
        });
      },
    }),
    {
      name: 'onyx-user-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

interface AppState {
  isVaultOpen: boolean;
  selectedArtifact: Artifact | null;
  scanResult: { tagHash: string; status: string } | null;
  
  setVaultOpen: (open: boolean) => void;
  setSelectedArtifact: (artifact: Artifact | null) => void;
  setScanResult: (result: { tagHash: string; status: string } | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isVaultOpen: false,
  selectedArtifact: null,
  scanResult: null,

  setVaultOpen: (isVaultOpen) => set({ isVaultOpen }),
  setSelectedArtifact: (selectedArtifact) => set({ selectedArtifact }),
  setScanResult: (scanResult) => set({ scanResult }),
}));
