import { create } from 'zustand';
import type { Plan, CreatePlanInput, UpdatePlanInput } from '@schedule-ai/core';
import * as db from '../db';

interface PlanState {
  plans: Plan[];
  isLoading: boolean;
  error: string | null;

  // Actions
  loadPlans: () => Promise<void>;
  createPlan: (input: CreatePlanInput) => Promise<Plan>;
  updatePlan: (id: string, input: UpdatePlanInput) => Promise<void>;
  deletePlan: (id: string) => Promise<void>;
}

export const usePlanStore = create<PlanState>((set, get) => ({
  plans: [],
  isLoading: false,
  error: null,

  loadPlans: async () => {
    set({ isLoading: true, error: null });

    try {
      const plans = await db.getPlans();
      set({ plans, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load plans',
        isLoading: false,
      });
    }
  },

  createPlan: async (input: CreatePlanInput) => {
    set({ isLoading: true, error: null });

    try {
      const plan = await db.createPlan(input);
      const { plans } = get();
      set({ plans: [plan, ...plans], isLoading: false });
      return plan;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create plan',
        isLoading: false,
      });
      throw error;
    }
  },

  updatePlan: async (id: string, input: UpdatePlanInput) => {
    try {
      const updatedPlan = await db.updatePlan(id, input);
      if (updatedPlan) {
        const { plans } = get();
        set({
          plans: plans.map((p) => (p.id === id ? updatedPlan : p)),
        });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update plan',
      });
    }
  },

  deletePlan: async (id: string) => {
    try {
      await db.deletePlan(id);
      const { plans } = get();
      set({ plans: plans.filter((p) => p.id !== id) });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete plan',
      });
    }
  },
}));
