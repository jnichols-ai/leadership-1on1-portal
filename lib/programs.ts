import type { Program, ProgramSession } from './types';
import fiveLevels from '@/programs/5-levels-of-leadership.json';
import sevenHabits from '@/programs/7-habits-of-highly-effective-people.json';
import idealTeamPlayer from '@/programs/ideal-frontline-team-player.json';
import { MAX_CRITERIA } from './config';

/**
 * Program registry.
 *
 * To onboard a new book:
 *   1. Add its JSON file to /programs
 *   2. Import it and add it to REGISTRY below
 *   3. Create a matching group on BOTH monday boards and add both ids to
 *      PROGRAM_GROUPS (the ids differ per board)
 *
 * No other code changes are required — the session form renders entirely from
 * this data.
 */
const REGISTRY: Program[] = [
  fiveLevels as unknown as Program,
  sevenHabits as unknown as Program,
  idealTeamPlayer as unknown as Program,
];

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

export { promptLabel } from './prompt-labels';

/**
 * The number of sign-off criteria a program uses. Every session in a program
 * must agree on this, because it maps onto a fixed set of monday columns.
 */
export function criteriaCount(program: Program): number {
  return program.sessions[0]?.successCriteria.length ?? 0;
}

/**
 * Validates that every program in the registry matches the structural contract
 * the UI and the monday schema depend on:
 *
 *   - exactly 3 blocks per session (three Block Rating / Block Notes column
 *     pairs exist on the session board);
 *   - a consistent number of success criteria within a program, between 1 and
 *     MAX_CRITERIA (one monday checkbox column each). Programs may differ from
 *     each other: 5 Levels uses 3, 7 Habits uses 4.
 *
 * Called at build/startup so a malformed new book fails loudly rather than
 * rendering a broken form.
 */
export function validateRegistry(): void {
  for (const program of REGISTRY) {
    if (program.sessions.length !== program.sessionCount) {
      throw new Error(
        `${program.programId}: sessionCount is ${program.sessionCount} but ${program.sessions.length} sessions are defined`
      );
    }
    const expectedCriteria = criteriaCount(program);
    if (expectedCriteria < 1 || expectedCriteria > MAX_CRITERIA) {
      throw new Error(
        `${program.programId}: ${expectedCriteria} success criteria per session, but the session board has ${MAX_CRITERIA} criterion columns. Add a column and extend SESSION_BOARD.columns.criterion.`
      );
    }
    for (const session of program.sessions) {
      if (session.blocks.length !== 3) {
        throw new Error(
          `${program.programId} session ${session.sessionNumber}: expected 3 blocks, got ${session.blocks.length}`
        );
      }
      if (session.successCriteria.length !== expectedCriteria) {
        throw new Error(
          `${program.programId} session ${session.sessionNumber}: expected ${expectedCriteria} success criteria (set by session 1), got ${session.successCriteria.length}`
        );
      }
    }
  }
}

validateRegistry();
