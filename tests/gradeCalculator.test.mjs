import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScenarios,
  calculateAdvancedGrade,
  calculateDroppedGrade,
  calculateGpa,
  calculateLetterGrade,
  calculateOverallGrade,
  calculateRequiredComponentScore,
  calculateRequiredPoints,
  calculateRequiredScore,
  calculateRequiredTestScore,
  formatPercent,
} from '../src/scripts/gradeCalculator.mjs';

const closeTo = (actual, expected, tolerance = 1e-10) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`);
};

test('calculates required final score using the weighted-grade formula', () => {
  const result = calculateRequiredScore({ current: 92.4, target: 90, weight: 10 });
  assert.equal(result.status, 'achievable');
  assert.ok(Math.abs(result.requiredScore - 68.4) < 1e-10);
  assert.ok(Math.abs(result.maximumCourseGrade - 93.16) < 1e-10);
});

test('distinguishes a perfect-score target, impossible target, and already achieved target', () => {
  assert.equal(calculateRequiredScore({ current: 80, target: 82, weight: 10 }).status, 'perfect-score');
  assert.equal(calculateRequiredScore({ current: 80, target: 83, weight: 10 }).status, 'impossible');
  assert.equal(calculateRequiredScore({ current: 92, target: 80, weight: 10 }).status, 'already-achieved');
});

test('handles a zero-weight final without division by zero', () => {
  assert.equal(calculateRequiredScore({ current: 90, target: 90, weight: 0 }).status, 'already-achieved');
  const result = calculateRequiredScore({ current: 90, target: 91, weight: 0 });
  assert.equal(result.status, 'impossible');
  assert.equal(result.requiredScore, null);
});

test('handles 100% final weights, zero grades, perfect targets, and lower targets', () => {
  assert.equal(calculateRequiredScore({ current: 0, target: 100, weight: 100 }).requiredScore, 100);
  assert.equal(calculateRequiredScore({ current: 100, target: 100, weight: 100 }).requiredScore, 100);
  assert.equal(calculateRequiredScore({ current: 100, target: 80, weight: 20 }).status, 'already-achieved');
});

test('calculates the final overall course grade', () => {
  assert.equal(calculateOverallGrade({ current: 90, finalScore: 80, weight: 20 }), 88);
});

test('validates bounded scores and weights', () => {
  assert.throws(() => calculateRequiredScore({ current: -1, target: 90, weight: 10 }), RangeError);
  assert.throws(() => calculateRequiredScore({ current: 90, target: 90, weight: 101 }), RangeError);
  assert.throws(() => calculateOverallGrade({ current: 90, finalScore: 101, weight: 20 }), RangeError);
  assert.throws(() => calculateRequiredScore({ current: 90, target: 90, weight: -1 }), RangeError);
});

test('calculates component score from the remaining weighted components', () => {
  const result = calculateRequiredComponentScore({
    current: 90,
    target: 90,
    finalWeight: 20,
    components: [
      { score: 80, weight: 50 },
      { score: '', weight: 50 },
    ],
  });
  assert.equal(result.requiredScore, 100);
  assert.equal(result.status, 'perfect-score');
});

test('requires component weights to add up to 100', () => {
  assert.throws(() => calculateRequiredComponentScore({
    current: 90,
    target: 90,
    finalWeight: 20,
    components: [{ score: '', weight: 50 }],
  }), /add up to 100/);
});

test('calculates points required on a final', () => {
  const result = calculateRequiredPoints({
    pointsEarned: 180,
    pointsPossible: 200,
    finalPoints: 100,
    target: 90,
  });
  assert.equal(result.requiredPoints, 90);
  assert.equal(result.requiredScore, 90);
  assert.equal(result.status, 'achievable');
});

test('handles points-based goals that are already achieved or impossible', () => {
  assert.equal(calculateRequiredPoints({
    pointsEarned: 95, pointsPossible: 100, finalPoints: 20, target: 75,
  }).status, 'already-achieved');
  assert.equal(calculateRequiredPoints({
    pointsEarned: 50, pointsPossible: 100, finalPoints: 10, target: 90,
  }).status, 'impossible');
  assert.throws(() => calculateRequiredPoints({
    pointsEarned: 10, pointsPossible: 0, finalPoints: 10, target: 90,
  }), RangeError);
});

test('drops the configured number of lowest scores before calculating the goal', () => {
  const result = calculateDroppedGrade({
    scores: [{ score: 50, weight: 1 }, { score: 80, weight: 1 }, { score: 100, weight: 1 }],
    target: 90,
    finalWeight: 20,
    dropCount: 1,
  });
  assert.equal(result.currentGrade, 90);
  assert.equal(result.droppedScores, 1);
  assert.deepEqual(result.droppedItems, [50]);
  assert.equal(result.requiredScore, 90);
});

test('supports weighted test averages and rejects dropping every score', () => {
  const result = calculateRequiredTestScore({
    scores: [{ score: 60, weight: 1 }, { score: 90, weight: 3 }],
    target: 90,
    finalWeight: 20,
  });
  assert.equal(result.currentGrade, 82.5);
  assert.throws(() => calculateRequiredTestScore({
    scores: [{ score: 70, weight: 1 }],
    target: 90,
    finalWeight: 20,
    dropLowest: 1,
  }), RangeError);
});

test('calculates weighted assignment and course contributions independently', () => {
  const result = calculateAdvancedGrade({
    categories: [{ name: 'Homework', weight: 20, assignments: [
      { score: 80, weight: 30 },
      { score: 90, weight: 30 },
      { score: 100, weight: 40 },
    ] }],
    target: 90, finalWeight: 80,
  });
  closeTo(result.currentGrade, 91);
  closeTo(result.currentCourseContribution, 18.2);
  closeTo(result.completedCourseWeight, 20);
  closeTo(result.remainingCourseWeight, 80);
  closeTo(result.requiredScore, 89.75);
  closeTo(result.maximumCourseGrade, 98.2);
  assert.equal(result.status, 'achievable');
});

test('validates weighted category totals below and above 100%', () => {
  assert.throws(() => calculateAdvancedGrade({
    categories: [{ weight: 60, assignments: [{ score: 90 }] }],
    target: 90, finalWeight: 30,
  }), /add up to 100/);
  assert.throws(() => calculateAdvancedGrade({
    categories: [{ weight: 80, assignments: [{ score: 90 }] }],
    target: 90, finalWeight: 30,
  }), /add up to 100/);
  assert.equal(calculateAdvancedGrade({
    categories: [{ weight: 60, assignments: [{ score: 90 }] }],
    target: 90, finalWeight: 40,
  }).maximumCourseGrade, 94);
});

test('blank assignments remain future work while missing assignments count as completed zeroes', () => {
  const pending = calculateAdvancedGrade({
    categories: [{ weight: 70, assignments: [{ score: 80, weight: 1 }, { score: null, weight: 1 }] }],
    target: 90, finalWeight: 30,
  });
  closeTo(pending.currentCourseContribution, 28);
  closeTo(pending.currentGrade, 80);
  closeTo(pending.completedCourseWeight, 35);
  closeTo(pending.remainingCourseWeight, 65);
  closeTo(pending.requiredScore, 95.38461538461539);

  const missing = calculateAdvancedGrade({
    categories: [{ weight: 50, assignments: [{ score: 80, weight: 3 }, { status: 'missing', weight: 1 }] }],
    target: 80, finalWeight: 50,
  });
  closeTo(missing.currentGrade, 60);
  closeTo(missing.currentCourseContribution, 30);
  assert.equal(missing.status, 'perfect-score');
});

test('handles all-blank work, all-missing work, empty categories, and no categories', () => {
  const allBlank = calculateAdvancedGrade({
    categories: [{ weight: 70, assignments: [{ score: '', weight: 1 }, { score: null, weight: 1 }] }],
    target: 90, finalWeight: 30,
  });
  assert.equal(allBlank.currentCourseContribution, 0);
  assert.equal(allBlank.completedCourseWeight, 0);
  assert.equal(allBlank.remainingCourseWeight, 100);
  assert.equal(allBlank.requiredScore, 90);

  const allMissing = calculateAdvancedGrade({
    categories: [{ weight: 70, assignments: [{ status: 'missing' }, { status: 'missing' }] }],
    target: 90, finalWeight: 30,
  });
  assert.equal(allMissing.currentCourseContribution, 0);
  assert.equal(allMissing.completedCourseWeight, 70);
  assert.equal(allMissing.remainingCourseWeight, 30);

  const emptyCategory = calculateAdvancedGrade({
    categories: [{ weight: 70, assignments: [] }],
    target: 90, finalWeight: 30,
  });
  assert.equal(emptyCategory.remainingCourseWeight, 100);
  assert.equal(emptyCategory.requiredScore, 90);
  assert.equal(calculateAdvancedGrade({ categories: [], target: 90, finalWeight: 100 }).requiredScore, 90);
  assert.throws(() => calculateAdvancedGrade({ categories: [], target: 90, finalWeight: 20 }), /Add a category/);
});

test('equal category averages give each category equal influence despite assignment counts', () => {
  const result = calculateAdvancedGrade({
    categories: [
      { weight: 90, assignments: [{ score: 80 }, { score: 80 }, { score: 80 }] },
      { weight: 10, assignments: [{ score: 100 }] },
    ],
    target: 90, finalWeight: 0, weighting: 'unweighted',
  });
  assert.equal(result.currentCourseContribution, 90);
  assert.equal(result.currentGrade, 90);
  assert.equal(result.completedCourseWeight, 100);
  assert.equal(result.status, 'already-achieved');
});

test('zero-weight categories and assignments do not affect the course grade', () => {
  const result = calculateAdvancedGrade({
    categories: [
      { weight: 0, assignments: [{ score: 100, weight: 5 }] },
      { weight: 0, assignments: [{ score: 100, weight: 0 }] },
    ],
    target: 90, finalWeight: 100,
  });
  assert.equal(result.currentCourseContribution, 0);
  assert.equal(result.completedCourseWeight, 0);
  assert.equal(result.requiredScore, 90);
});

test('extra credit adds its category percentage points once and ignores assignment weight', () => {
  const result = calculateAdvancedGrade({
    categories: [{ weight: 50, assignments: [
      { score: 80, weight: 1 },
      { status: 'extra', score: 5, weight: 1000 },
    ] }],
    target: 90, finalWeight: 50,
  });
  closeTo(result.currentCourseContribution, 42.5);
  closeTo(result.currentGrade, 85);
  closeTo(result.requiredScore, 95);
});

test('makeup and retake scores remain separate under the default policy', () => {
  const result = calculateAdvancedGrade({
    categories: [{ weight: 100, assignments: [
      { name: 'Exam 1', score: 60, weight: 1 },
      { name: 'Exam 1 makeup', status: 'makeup', score: 80, weight: 1 },
      { name: 'Exam 1', status: 'retake', score: 90, weight: 1 },
    ] }],
    target: 70, finalWeight: 0,
  });
  closeTo(result.currentGrade, 230 / 3);
  closeTo(result.currentCourseContribution, 230 / 3);
});

test('retake rules match assignment names and keep the original relative weight', () => {
  const categories = [{ weight: 100, assignments: [
    { name: 'Midterm', score: 60, weight: 3 },
    { name: 'Midterm', status: 'retake', score: 80, weight: 1 },
    { name: 'Midterm', status: 'retake', score: 70, weight: 1 },
  ] }];
  const resultFor = (retakeRule) => calculateAdvancedGrade({ categories, target: 70, finalWeight: 0, retakeRule });
  closeTo(resultFor('keep-both').currentGrade, 66);
  closeTo(resultFor('replace').currentGrade, 70);
  closeTo(resultFor('higher').currentGrade, 80);
  closeTo(resultFor('latest').currentGrade, 70);
  assert.throws(() => calculateAdvancedGrade({
    categories: [{ weight: 100, assignments: [{ name: 'Quiz retake', status: 'retake', score: 80 }] }],
    target: 70, finalWeight: 0, retakeRule: 'replace',
  }), /no matching original/);
});

test('converts earned and possible points to percentages before weighting assignments', () => {
  const result = calculateAdvancedGrade({
    categories: [{ weight: 40, assignments: [
      { pointsEarned: 45, pointsPossible: 50, weight: 1 },
      { pointsEarned: 150, pointsPossible: 200, weight: 3 },
    ] }],
    target: 90, finalWeight: 60,
  });
  closeTo(result.currentGrade, 78.75);
  closeTo(result.currentCourseContribution, 31.5);
  closeTo(result.requiredScore, 97.5);
  assert.throws(() => calculateAdvancedGrade({
    categories: [{ weight: 100, assignments: [{ pointsEarned: 4, weight: 1 }] }],
    target: 90, finalWeight: 0,
  }), /both earned and possible points/);
  assert.throws(() => calculateAdvancedGrade({
    categories: [{ weight: 100, assignments: [{ pointsEarned: 6, pointsPossible: 5, weight: 1 }] }],
    target: 90, finalWeight: 0,
  }), /no greater than positive possible points/);
});

test('handles perfect, impossible, zero-remaining and bounded-target cases', () => {
  const calculate = ({ score = 80, target, finalWeight = 20 }) => calculateAdvancedGrade({
    categories: [{ weight: 100 - finalWeight, assignments: [{ score, weight: 1 }] }],
    target, finalWeight,
  });
  assert.equal(calculate({ target: 84 }).requiredScore, 100);
  assert.equal(calculate({ target: 85 }).status, 'impossible');
  assert.equal(calculate({ target: 60 }).status, 'already-achieved');
  assert.equal(calculate({ score: 80, target: 90, finalWeight: 0 }).status, 'impossible');
  assert.equal(calculate({ score: 0, target: 0 }).status, 'already-achieved');
  assert.throws(() => calculate({ target: 101 }), /between 0 and 100/);
  assert.throws(() => calculateAdvancedGrade({
    categories: [{ weight: 0, assignments: [{ score: 90, weight: -1 }] }],
    target: 90, finalWeight: 100,
  }), /weights cannot be negative/);
  assert.throws(() => calculateAdvancedGrade({
    categories: [{ weight: 0, assignments: [{ score: 101, weight: 1 }] }],
    target: 90, finalWeight: 100,
  }), /between 0 and 100/);
  assert.throws(() => calculateAdvancedGrade({
    categories: [{ weight: 100, assignments: [{ score: 80, weight: 1 }] }],
    target: '', finalWeight: 0,
  }), /finite number/);
  assert.throws(() => calculateAdvancedGrade({
    categories: [{ weight: 100, assignments: [{ score: Number.NaN, weight: 1 }] }],
    target: 90, finalWeight: 0,
  }), /finite number/);
});

test('only maps a grade when the user has supplied thresholds', () => {
  const thresholds = [
    { label: 'A', minimum: 90, gpa: 4 },
    { label: 'B', minimum: 80, gpa: 3 },
  ];
  assert.equal(calculateLetterGrade(88, thresholds), 'B');
  assert.equal(calculateGpa(91, thresholds), 4);
  assert.equal(calculateLetterGrade(90, []), null);
  assert.equal(calculateGpa(90, []), null);
});

test('builds scenarios from the weighted calculation rather than fixed chart values', () => {
  assert.deepEqual(buildScenarios({ current: 90, weight: 20 }).map((item) => item.courseGrade), [82, 84, 86, 88, 90, 92]);
});

test('formats display values without floating-point tails', () => {
  assert.equal(formatPercent(93.16000000000001), '93.2%');
  assert.equal(formatPercent(null), '—');
});
