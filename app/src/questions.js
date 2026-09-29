// The daily quiz bank. Each question is
// [question, correct answer, wrong answer, wrong answer, wrong answer, explanation].
// Answers are shuffled when shown. A question's id is its position in the
// combined list, so only ever add new questions at the END of the last file.

import { PART_A } from './questions-a.js';
import { PART_B } from './questions-b.js';

export const QUESTIONS = [...PART_A, ...PART_B];
