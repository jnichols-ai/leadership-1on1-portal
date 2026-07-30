import type { Program, ProgramSession } from './types';
import fiveLevels from '@/programs/5-levels-of-leadership.json';

/**
 * Program registry.
 *
 * To onboard a new book:
 *   1. Add its JSON file to /programs
 *   2. Import it and add it to REGISTRY below
 *   3. Create a matching group on the monday board and add it to PROGRAM_GROUPS
 *
 * No other code changes are required — the session form renders entirely from
 * this data.
 */
const REGISTRY: Program[] = [fiveLevels as unknown as Program];

export function listPrograms(): Program[] {
  return REGISTRY;
}

export function getProgram(programId: string): Program {
  const program = REGISTRY.find((p) => p.programId === programId);
  if (!program) {
    throw new Error(`Unknown program: ${programId}`);
  }
  return program;
}

export function getSession(
  programId: string,
  sessionNumber: number
): ProgramSession {
  const program = getProgram(programId);
  const session = program.sessions.find(
    (s) => s.sessionNumber === sessionNumber
  );
  if (!session) {
    throw new Error(`Program ${programId} has no session ${sessionNumber}`);
  }
  return session;
}

const PROMPT_LABELS: Record<string, string> = {
  probe: 'Probe',
  coachable_moment: 'The Coachable Moment',
  share_your_experience: 'Share Your Experience',
  your_role: 'Your Role',
};

export function promptLabel(type: string): string {
  return PROMPT_LABELS[type] ?? 'Prompt';
}

/**
 * Validates that every program in the registry matches the structural contract
 * the UI and the monday schema depend on: exactly 3 blocks and exactly 3
 * success criteria per session. Called at build/startup so a malformed new
 * book fails loudly rather than rendering a broken form.
 */
export function validateRegistry(): void {
  for (const program of REGISTRY) {
    if (program.sessions.length !== program.sessionCount) {
      throw new Error(
        `${program.programId}: sessionCount is ${program.sessionCount} but ${program.sessions.length} sessions are defined`
      );
    }
    for (const session of program.sessions) {
      if (session.blocks.length !== 3) {
        throw new Error(
          `${program.programId} session ${session.sessionNumber}: expected 3 blocks, got ${session.blocks.length}`
        );
      }
      if (session.successCriteria.length !== 3) {
        throw new Error(
          `${program.programId} session ${session.sessionNumber}: expected 3 success criteria, got ${session.successCriteria.length}`
        );
      }
    }
  }
}

validateRegistry();
