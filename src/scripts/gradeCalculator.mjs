const EPSILON = 1e-9;

function finiteNumber(value, label) {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  return number;
}

function bounded(value, label, min, max) {
  const number = finiteNumber(value, label);
  if (number < min || number > max) {
    throw new RangeError(`${label} must be between ${min} and ${max}.`);
  }
  return number;
}

export function calculateRequiredScore({ current, target, weight, maxScore = 100 }) {
  const currentGrade = bounded(current, 'Current grade', 0, 100);
  const targetGrade = bounded(target, 'Target grade', 0, 100);
  const finalWeight = bounded(weight, 'Final weight', 0, 100);
  const scoreLimit = finiteNumber(maxScore, 'Maximum score');
  if (scoreLimit <= 0) throw new RangeError('Maximum score must be greater than zero.');

  const maximumCourseGrade = currentGrade * (1 - finalWeight / 100) + scoreLimit * (finalWeight / 100);
  const currentCourseContribution = currentGrade * (1 - finalWeight / 100);

  if (targetGrade <= currentCourseContribution + EPSILON && finalWeight > 0) {
    return {
      status: 'already-achieved',
      requiredScore: 0,
      maximumCourseGrade,
      currentCourseContribution,
      finalCourseWeight: finalWeight,
    };
  }

  if (finalWeight === 0) {
    return {
      status: targetGrade <= currentGrade + EPSILON ? 'already-achieved' : 'impossible',
      requiredScore: null,
      maximumCourseGrade: currentGrade,
      currentCourseContribution: currentGrade,
      finalCourseWeight: 0,
    };
  }

  const requiredScore = (targetGrade - currentCourseContribution) / (finalWeight / 100);
  let status = 'achievable';
  if (requiredScore > scoreLimit + EPSILON) status = 'impossible';
  else if (requiredScore >= scoreLimit - EPSILON) status = 'perfect-score';

  return {
    status,
    requiredScore,
    maximumCourseGrade,
    currentCourseContribution,
    finalCourseWeight: finalWeight,
  };
}

export function calculateOverallGrade({ current, finalScore, weight }) {
  const currentGrade = bounded(current, 'Current grade', 0, 100);
  const score = bounded(finalScore, 'Final exam score', 0, 100);
  const finalWeight = bounded(weight, 'Final weight', 0, 100);
  return currentGrade * (1 - finalWeight / 100) + score * (finalWeight / 100);
}

function validateWeightedScores(items, label = 'Scores') {
  if (!Array.isArray(items) || items.length === 0) {
    throw new RangeError(`${label} must include at least one score.`);
  }
  return items.map((item, index) => {
    const score = bounded(item.score, `${label} score ${index + 1}`, 0, 100);
    const weight = finiteNumber(item.weight, `${label} weight ${index + 1}`);
    if (weight <= 0) throw new RangeError(`${label} weights must be greater than zero.`);
    return { ...item, score, weight };
  });
}

export function calculateRequiredTestScore({ scores, target, finalWeight, dropLowest = 0 }) {
  const entries = validateWeightedScores(scores, 'Test');
  const drops = finiteNumber(dropLowest, 'Number of dropped scores');
  if (!Number.isInteger(drops) || drops < 0 || drops >= entries.length) {
    throw new RangeError('Drop count must be a whole number from zero to one less than the score count.');
  }
  const retained = entries
    .map((item, index) => ({ ...item, index }))
    .sort((a, b) => a.score - b.score)
    .slice(drops)
    .sort((a, b) => a.index - b.index);
  const retainedIndexes = new Set(retained.map((item) => item.index));
  const totalWeight = retained.reduce((sum, item) => sum + item.weight, 0);
  const current = retained.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight;
  return {
    ...calculateRequiredScore({ current, target, weight: finalWeight }),
    currentGrade: current,
    retainedScores: retained,
    droppedItems: entries
      .filter((_, index) => !retainedIndexes.has(index))
      .map((item) => item.score),
    droppedScores: entries.length - retained.length,
  };
}

export function calculateRequiredComponentScore({ current, target, finalWeight, components }) {
  const currentGrade = bounded(current, 'Current grade', 0, 100);
  const targetGrade = bounded(target, 'Target grade', 0, 100);
  const examWeight = bounded(finalWeight, 'Final exam weight', 0, 100);
  if (!Array.isArray(components) || components.length === 0) {
    throw new RangeError('Add at least one exam component.');
  }
  const items = components.map((item, index) => {
    const rawScore = item.score;
    const score = rawScore === null || rawScore === undefined || rawScore === ''
      ? null
      : bounded(rawScore, `Component score ${index + 1}`, 0, 100);
    const weight = finiteNumber(item.weight, `Component weight ${index + 1}`);
    if (weight <= 0) throw new RangeError('Component weights must be greater than zero.');
    return { score, weight };
  });
  const componentWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (Math.abs(componentWeight - 100) > 0.01) {
    throw new RangeError('Final exam component weights must add up to 100%.');
  }
  const graded = items.filter((item) => item.score !== null);
  const remaining = items.filter((item) => item.score === null);
  const courseworkContribution = currentGrade * (1 - examWeight / 100);
  const earnedComponentContribution = graded.reduce(
    (sum, item) => sum + (examWeight / 100) * (item.weight / 100) * item.score,
    0,
  );
  const remainingContributionWeight = remaining.reduce(
    (sum, item) => sum + (examWeight / 100) * (item.weight / 100),
    0,
  );
  const needed = targetGrade - courseworkContribution - earnedComponentContribution;
  const maximumCourseGrade = courseworkContribution
    + earnedComponentContribution
    + remainingContributionWeight * 100;

  if (remainingContributionWeight === 0) {
    return {
      status: targetGrade <= courseworkContribution + earnedComponentContribution + EPSILON
        ? 'already-achieved'
        : 'impossible',
      requiredScore: null,
      maximumCourseGrade,
      currentCourseContribution: courseworkContribution + earnedComponentContribution,
      finalCourseWeight: 0,
    };
  }
  if (needed <= EPSILON) {
    return {
      status: 'already-achieved',
      requiredScore: 0,
      maximumCourseGrade,
      currentCourseContribution: courseworkContribution + earnedComponentContribution,
      finalCourseWeight: remainingContributionWeight * 100,
    };
  }

  const requiredScore = needed / remainingContributionWeight;
  return {
    status: requiredScore > 100 + EPSILON ? 'impossible' : requiredScore >= 100 - EPSILON ? 'perfect-score' : 'achievable',
    requiredScore,
    maximumCourseGrade,
    currentCourseContribution: courseworkContribution + earnedComponentContribution,
    finalCourseWeight: remainingContributionWeight * 100,
  };
}

export function calculateRequiredPoints({ pointsEarned, pointsPossible, finalPoints, target }) {
  const earned = finiteNumber(pointsEarned, 'Points earned');
  const possible = finiteNumber(pointsPossible, 'Points possible');
  const available = finiteNumber(finalPoints, 'Final points');
  const targetGrade = bounded(target, 'Target grade', 0, 100);
  if (earned < 0 || possible <= 0 || available <= 0 || earned > possible) {
    throw new RangeError('Points must be non-negative, points possible and final points must be positive, and earned points cannot exceed points possible.');
  }
  const totalPoints = possible + available;
  const requiredPoints = (targetGrade / 100) * totalPoints - earned;
  const requiredPercent = (requiredPoints / available) * 100;
  const currentGrade = (earned / possible) * 100;
  const maximumCourseGrade = ((earned + available) / totalPoints) * 100;
  const status = requiredPoints <= EPSILON
    ? 'already-achieved'
    : requiredPoints > available + EPSILON
      ? 'impossible'
      : requiredPoints >= available - EPSILON
        ? 'perfect-score'
        : 'achievable';
  return {
    status,
    requiredPoints: Math.max(0, requiredPoints),
    requiredScore: Math.max(0, requiredPercent),
    currentGrade,
    maximumCourseGrade,
    totalPoints,
  };
}

export function calculateDroppedGrade({ scores, target, finalWeight, dropCount = 1 }) {
  return calculateRequiredTestScore({ scores, target, finalWeight, dropLowest: dropCount });
}

function assignmentScore(item, label, status) {
  if (status === 'missing') return 0;
  if (status === 'extra') {
    const points = item.extraCreditPoints ?? item.score;
    return points === '' || points === null || points === undefined
      ? null
      : bounded(points, `${label} extra-credit percentage points`, 0, 100);
  }
  const hasEarned = item.pointsEarned !== undefined && item.pointsEarned !== null && item.pointsEarned !== '';
  const hasPossible = item.pointsPossible !== undefined && item.pointsPossible !== null && item.pointsPossible !== '';
  if (hasEarned !== hasPossible) throw new TypeError(`${label} must include both earned and possible points.`);
  if (hasEarned) {
    const earned = finiteNumber(item.pointsEarned, `${label} points earned`);
    const possible = finiteNumber(item.pointsPossible, `${label} points possible`);
    if (possible <= 0 || earned < 0 || earned > possible) {
      throw new RangeError(`${label} points must be non-negative, with earned points no greater than positive possible points.`);
    }
    return (earned / possible) * 100;
  }
  if (item.score === '' || item.score === null || item.score === undefined) return null;
  return bounded(item.score, `${label} percentage`, 0, 100);
}

function resolveRetakes(assignments, rule, categoryIndex) {
  if (rule === 'keep-both') return assignments;
  if (!['replace', 'higher', 'latest'].includes(rule)) {
    throw new RangeError('Choose a valid retake rule.');
  }
  const result = [];
  const retakesByName = new Map();
  for (const assignment of assignments) {
    if (assignment.status !== 'retake') continue;
    const name = assignment.name.trim().toLocaleLowerCase();
    if (!name) throw new RangeError('Name retakes to match them to the original assignment.');
    const list = retakesByName.get(name) || [];
    list.push(assignment);
    retakesByName.set(name, list);
  }
  const originals = assignments.filter((item) => item.status !== 'retake' && item.status !== 'makeup' && item.status !== 'extra');
  for (const name of retakesByName.keys()) {
    if (originals.filter((item) => item.name.trim().toLocaleLowerCase() === name).length > 1) {
      throw new RangeError(`Category ${categoryIndex + 1} has multiple originals named "${name}"; rename them before applying a retake rule.`);
    }
  }
  const matchedRetakes = new Set();
  for (const original of originals) {
    const name = original.name.trim().toLocaleLowerCase();
    const retakes = retakesByName.get(name) || [];
    if (!retakes.length) {
      result.push(original);
      continue;
    }
    retakes.forEach((retake) => matchedRetakes.add(retake));
    const latest = retakes.at(-1);
    const scores = [original.score, ...retakes.map((retake) => retake.score)].filter((score) => score !== null);
    result.push({
      ...original,
      score: rule === 'higher' ? (scores.length ? Math.max(...scores) : null) : latest.score,
    });
  }
  for (const assignment of assignments) {
    if (assignment.status === 'makeup' || assignment.status === 'extra') result.push(assignment);
    else if (assignment.status === 'retake' && !matchedRetakes.has(assignment)) {
      throw new RangeError(`Category ${categoryIndex + 1} retake "${assignment.name}" has no matching original assignment.`);
    }
  }
  return result;
}

export function calculateAdvancedGrade({
  categories,
  target,
  finalWeight,
  weighting = 'weighted',
  retakeRule = 'keep-both',
}) {
  if (!Array.isArray(categories)) throw new TypeError('Grade categories must be a list.');
  if (!['weighted', 'unweighted'].includes(weighting)) throw new RangeError('Choose weighted or equal category averages.');
  const finalPercent = bounded(finalWeight, 'Final/remaining work weight', 0, 100);
  if (categories.length === 0 && finalPercent !== 100) {
    throw new RangeError('Add a category or set final/remaining work to 100% when no categories are listed.');
  }
  const targetGrade = bounded(target, 'Target grade', 0, 100);
  const parsed = categories.map((category, index) => {
    const weight = finiteNumber(category.weight, `Category ${index + 1} weight`);
    if (weight < 0 || weight > 100) throw new RangeError('Category weights must be between 0 and 100%.');
    const assignments = category.assignments ?? [];
    if (!Array.isArray(assignments)) throw new TypeError(`Category ${index + 1} assignments must be a list.`);
    const normalized = assignments.map((item, itemIndex) => {
      const status = item.status ?? (item.extraCredit ? 'extra' : 'graded');
      if (!['graded', 'missing', 'makeup', 'retake', 'extra'].includes(status)) {
        throw new RangeError(`Category ${index + 1}, assignment ${itemIndex + 1} has an invalid status.`);
      }
      const label = `Category ${index + 1}, assignment ${itemIndex + 1}`;
      const score = assignmentScore(item, label, status);
      const weightValue = status === 'extra' ? 0 : finiteNumber(item.weight ?? 1, `${label} weight`);
      if (weightValue < 0) throw new RangeError('Assignment weights cannot be negative.');
      return {
        name: String(item.name ?? '').trim(),
        status,
        score,
        weight: weightValue,
      };
    });
    const effective = resolveRetakes(normalized, retakeRule, index)
      .filter((item) => item.status !== 'extra' && item.weight > 0);
    const regularWeight = effective.reduce((sum, item) => sum + item.weight, 0);
    const completed = effective.filter((item) => item.score !== null);
    const completedWeight = completed.reduce((sum, item) => sum + item.weight, 0);
    const completedPoints = completed.reduce((sum, item) => sum + item.score * item.weight, 0);
    const pendingWeight = regularWeight - completedWeight;
    const extraCreditPoints = normalized
      .filter((item) => item.status === 'extra' && item.score !== null)
      .reduce((sum, item) => sum + item.score, 0);
    return { weight, regularWeight, completedWeight, completedPoints, pendingWeight, extraCreditPoints };
  });

  const categoryWeights = parsed.reduce((sum, category) => sum + category.weight, 0);
  if (weighting === 'weighted' && Math.abs(categoryWeights + finalPercent - 100) > 0.01) {
    throw new RangeError('Weighted category weights and final/remaining work must add up to 100% of the course.');
  }
  if (weighting === 'unweighted' && categories.length === 0 && finalPercent !== 100) {
    throw new RangeError('Equal category averages need at least one category unless final/remaining work is 100%.');
  }

  const equalCategoryShare = categories.length ? (100 - finalPercent) / categories.length : 0;
  const contribution = (sum, category) => {
    const share = weighting === 'unweighted' ? equalCategoryShare : category.weight;
    const regularGrade = category.regularWeight
      ? category.completedPoints / category.regularWeight
      : 0;
    return sum + share * (regularGrade + category.extraCreditPoints) / 100;
  };
  const currentContribution = parsed.reduce(contribution, 0);
  const completedCourseWeight = parsed.reduce((sum, category) => {
    const share = weighting === 'unweighted' ? equalCategoryShare : category.weight;
    return sum + (category.regularWeight ? share * category.completedWeight / category.regularWeight : 0);
  }, 0);
  const pendingCategoryWeight = parsed.reduce((sum, category) => {
    const share = weighting === 'unweighted' ? equalCategoryShare : category.weight;
    return sum + (category.regularWeight
      ? share * category.pendingWeight / category.regularWeight
      : share);
  }, 0);
  const remainingCourseWeight = finalPercent + pendingCategoryWeight;
  const maximumCourseGrade = currentContribution + remainingCourseWeight;
  const currentGrade = completedCourseWeight > 0
    ? (currentContribution / completedCourseWeight) * 100
    : 0;
  let requiredScore = null;
  let status;
  if (targetGrade <= currentContribution + EPSILON) {
    status = 'already-achieved';
    requiredScore = 0;
  } else if (remainingCourseWeight <= EPSILON || targetGrade > maximumCourseGrade + EPSILON) {
    status = 'impossible';
  } else {
    requiredScore = ((targetGrade - currentContribution) / remainingCourseWeight) * 100;
    status = requiredScore > 100 + EPSILON ? 'impossible' : requiredScore >= 100 - EPSILON ? 'perfect-score' : 'achievable';
  }
  return {
    status,
    requiredScore,
    currentGrade,
    currentCourseContribution: currentContribution,
    completedCourseWeight,
    finalCourseWeight: remainingCourseWeight,
    remainingCourseWeight,
    maximumCourseGrade,
    gradedCategories: parsed.filter((category) => category.completedWeight > 0).length,
  };
}

export function calculateLetterGrade(score, thresholds) {
  const percentage = bounded(score, 'Percentage', 0, 100);
  if (!Array.isArray(thresholds) || thresholds.length === 0) return null;
  const sorted = thresholds
    .map((item) => ({ label: String(item.label || '').trim(), minimum: bounded(item.minimum, 'Grade threshold', 0, 100) }))
    .filter((item) => item.label)
    .sort((a, b) => b.minimum - a.minimum);
  if (!sorted.length) return null;
  return sorted.find((item) => percentage >= item.minimum)?.label ?? null;
}

export function calculateGpa(score, thresholds) {
  const percentage = bounded(score, 'Percentage', 0, 100);
  if (!Array.isArray(thresholds) || thresholds.length === 0) return null;
  const sorted = thresholds
    .map((item) => ({
      minimum: bounded(item.minimum, 'Grade threshold', 0, 100),
      gpa: item.gpa === null || item.gpa === undefined || item.gpa === ''
        ? null
        : finiteNumber(item.gpa, 'GPA threshold'),
    }))
    .filter((item) => item.gpa !== null)
    .sort((a, b) => b.minimum - a.minimum);
  return sorted.find((item) => percentage >= item.minimum)?.gpa ?? null;
}

export function buildScenarios({ current, weight, scores = [50, 60, 70, 80, 90, 100] }) {
  return scores.map((score) => ({
    finalScore: score,
    courseGrade: calculateOverallGrade({ current, finalScore: score, weight }),
  }));
}

export function formatPercent(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const formatted = Number(value).toFixed(digits).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return `${formatted}%`;
}
