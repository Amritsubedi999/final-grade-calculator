import {
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
} from './gradeCalculator.mjs';

const HISTORY_KEY = 'gradewise-recent-calculations';
const SETTINGS_KEY = 'gradewise-grading-settings';
const MAX_HISTORY = 5;

const numberFrom = (form, name, label) => {
  const raw = form.elements.namedItem(name)?.value;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw new TypeError(`${label} is required.`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be a number.`);
  return value;
};

const optionalNumber = (input) => {
  if (!input || input.value.trim() === '') return null;
  const value = Number(input.value);
  if (!Number.isFinite(value)) throw new TypeError('Enter a valid score.');
  return value;
};

const make = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

export function initGradeCalculator() {
  const form = document.querySelector('#grade-form');
  if (!form) return;

  const tabs = [...document.querySelectorAll('[role="tab"][data-mode]')];
  const panels = [...document.querySelectorAll('[data-panel]')];
  const errorBox = document.querySelector('#form-error');
  const toast = document.querySelector('#toast');
  let activeMode = 'required';
  let latestResult = null;
  let toastTimer;
  let storageWarningShown = false;
  const initialCategories = document.querySelector('#category-list')?.cloneNode(true);
  const initialRows = new Map(['#test-rows', '#drop-rows', '#component-rows']
    .map((selector) => [selector, document.querySelector(selector).innerHTML]));

  const announce = (message) => {
    toast.textContent = message;
    toast.classList.add('visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2600);
  };

  const storageAvailable = () => {
    try {
      localStorage.setItem('__gradewise_test__', '1');
      localStorage.removeItem('__gradewise_test__');
      return true;
    } catch {
      if (!storageWarningShown) {
        announce('Your browser blocked local storage. Calculations still work, but history will not be saved.');
        storageWarningShown = true;
      }
      return false;
    }
  };

  const setError = (message) => {
    errorBox.textContent = message;
    errorBox.hidden = !message;
  };

  const setMode = (mode, focus = false) => {
    activeMode = mode;
    for (const tab of tabs) {
      const selected = tab.dataset.mode === mode;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    for (const panel of panels) {
      const selected = panel.dataset.panel === mode;
      panel.hidden = !selected;
      panel.setAttribute('aria-hidden', String(!selected));
      for (const input of panel.querySelectorAll('input, select, textarea, button')) {
        if (input.closest('#grade-form')) input.disabled = !selected;
      }
    }
    updateAdvancedWeighting();
    const calculateButton = document.querySelector('#calculate-button');
    const buttonLabels = {
      required: 'Calculate What I Need on the Final',
      overall: 'Calculate my overall grade',
      tests: 'Calculate my required test score',
      drops: 'Calculate with dropped grades',
      components: 'Calculate my component scores',
      points: 'Calculate the points I need',
      advanced: 'Calculate my weighted grade',
    };
    calculateButton.firstChild.textContent = `${buttonLabels[mode]} `;
    setError('');
    if (focus) document.querySelector(`[data-mode="${mode}"]`)?.focus();
    updateResult();
  };

  document.querySelector('#faq').addEventListener('click', (event) => {
    const link = event.target.closest('a[data-calculator-mode]');
    if (!link || !tabs.some((tab) => tab.dataset.mode === link.dataset.calculatorMode)) return;
    setMode(link.dataset.calculatorMode);
  });

  const readRows = (container, scoreSelector, weightSelector, allowBlank = false) => {
    const rows = [...container.querySelectorAll('.score-row')];
    if (!rows.length) throw new RangeError('Add at least one score.');
    return rows.map((row, index) => {
      const scoreInput = row.querySelector(scoreSelector);
      const rawScore = allowBlank ? optionalNumber(scoreInput) : numberFromInput(scoreInput, `Score ${index + 1}`);
      const weight = numberFromInput(row.querySelector(weightSelector), `Weight ${index + 1}`);
      return { score: rawScore, weight };
    });
  };

  const numberFromInput = (input, label) => {
    if (!input || input.value.trim() === '') throw new TypeError(`${label} is required.`);
    const value = Number(input.value);
    if (!Number.isFinite(value)) throw new TypeError(`${label} must be a number.`);
    return value;
  };

  const formState = () => {
    if (activeMode === 'required') {
      const current = numberFrom(form, 'current', 'Current grade');
      const target = numberFrom(form, 'target', 'Desired grade');
      const weight = numberFrom(form, 'weight', 'Final exam weight');
      const calculation = calculateRequiredScore({ current, target, weight });
      const remainingPoints = Math.max(0, target - calculation.currentCourseContribution);
      return {
        mode: activeMode,
        ...calculation,
        current,
        target,
        chartContribution: current * (1 - weight / 100),
        chartWeight: weight,
        display: {
          number: calculation.requiredScore,
          unit: '%',
          caption: weight === 0 ? 'A 0% final cannot change your course grade.' : calculation.status === 'already-achieved' ? 'Your target is covered even with 0% on the final.' : calculation.status === 'impossible' ? 'The target exceeds your best possible course grade.' : 'needed on your final to reach your target',
        },
        note: weight === 0
          ? 'Your final has no course weight. Your course grade stays at its current value regardless of the exam score.'
          : calculation.status === 'already-achieved'
            ? `Your current work contributes ${formatPercent(calculation.currentCourseContribution)}. That already covers your target, so 0% on the final is enough mathematically.`
            : `${formatPercent(current)} × ${Number((1 - weight / 100).toFixed(4))} = ${formatPercent(calculation.currentCourseContribution)} from current work. ${formatPercent(target)} − ${formatPercent(calculation.currentCourseContribution)} = ${formatPercent(remainingPoints)} still needed; ÷ ${Number((weight / 100).toFixed(4))} final share = ${formatPercent(calculation.requiredScore)} required.`,
      };
    }

    if (activeMode === 'overall') {
      const current = numberFrom(form, 'overallCurrent', 'Current grade');
      const score = numberFrom(form, 'finalScore', 'Final exam score');
      const weight = numberFrom(form, 'overallWeight', 'Final exam weight');
      const overall = calculateOverallGrade({ current, finalScore: score, weight });
      return {
        mode: activeMode,
        status: 'calculated',
        currentGrade: current,
        target: overall,
        maximumCourseGrade: calculateOverallGrade({ current, finalScore: 100, weight }),
        requiredScore: score,
        chartContribution: current * (1 - weight / 100),
        chartWeight: weight,
        display: { number: overall, unit: '%', caption: `overall course grade with a ${formatPercent(score)} final` },
        current,
        finalScore: score,
      };
    }

    if (activeMode === 'tests' || activeMode === 'drops') {
      const target = numberFrom(form, activeMode === 'tests' ? 'testsTarget' : 'dropsTarget', 'Target grade');
      const weight = numberFrom(form, activeMode === 'tests' ? 'testsWeight' : 'dropsWeight', 'Final exam weight');
      const selector = activeMode === 'tests' ? '#test-rows' : '#drop-rows';
      let scores = readRows(
        document.querySelector(selector),
        activeMode === 'tests' ? '.test-score' : '.drop-score',
        activeMode === 'tests' ? '.test-weight' : '.drop-weight',
      );
      if (activeMode === 'tests' && form.elements.namedItem('testWeighting').value === 'unweighted') {
        scores = scores.map((item) => ({ ...item, weight: 1 }));
      }
      const drops = activeMode === 'tests'
        ? numberFrom(form, 'dropCount', 'Number of dropped scores')
        : numberFrom(form, 'dropsCount', 'Number of dropped scores');
      const result = calculateRequiredTestScore({ scores, target, finalWeight: weight, dropLowest: drops });
      const weightingNote = activeMode === 'tests' && form.elements.namedItem('testWeighting').value === 'unweighted'
        ? ' The existing test average is unweighted.'
        : '';
      return {
        mode: activeMode,
        ...result,
        current: result.currentGrade,
        target,
        chartContribution: result.currentCourseContribution,
        chartWeight: result.finalCourseWeight,
        display: { number: result.requiredScore, unit: '%', caption: activeMode === 'drops' ? 'needed after applying your drop rule' : 'needed on your next test' },
        note: `${result.droppedScores ? `Dropped ${result.droppedItems.map((score) => formatPercent(score)).join(', ')} ${form.elements.namedItem('dropCategory')?.value?.toLowerCase() || 'test'} score${result.droppedScores === 1 ? '' : 's'} from your current average.` : 'No scores dropped.'}${weightingNote}`,
      };
    }

    if (activeMode === 'components') {
      const current = numberFrom(form, 'componentCurrent', 'Current grade');
      const target = numberFrom(form, 'componentTarget', 'Target grade');
      const examWeight = numberFrom(form, 'componentFinalWeight', 'Final exam weight');
      const componentRows = [...document.querySelectorAll('#component-rows .score-row')];
      const components = readRows(document.querySelector('#component-rows'), '.component-score', '.component-weight', true)
        .map((item, index) => ({ ...item, name: componentRows[index].querySelector('.row-name')?.value || `Component ${index + 1}` }));
      const result = calculateRequiredComponentScore({ current, target, finalWeight: examWeight, components });
      return {
        mode: activeMode,
        ...result,
        current,
        target,
        chartContribution: result.currentCourseContribution,
        chartWeight: result.finalCourseWeight,
        display: { number: result.requiredScore, unit: '%', caption: 'needed on each remaining component, on average' },
      };
    }

    if (activeMode === 'points') {
      const result = calculateRequiredPoints({
        pointsEarned: numberFrom(form, 'pointsEarned', 'Points earned'),
        pointsPossible: numberFrom(form, 'pointsPossible', 'Points possible'),
        finalPoints: numberFrom(form, 'finalPoints', 'Points available on final'),
        target: numberFrom(form, 'pointsTarget', 'Target grade'),
      });
      const finalPoints = numberFrom(form, 'finalPoints', 'Points available on final');
      const pointsPossible = numberFrom(form, 'pointsPossible', 'Points possible');
      const pointsEarned = numberFrom(form, 'pointsEarned', 'Points earned');
      return {
        mode: activeMode,
        ...result,
        current: result.currentGrade,
        target: numberFrom(form, 'pointsTarget', 'Target grade'),
        chartContribution: pointsEarned / result.totalPoints * 100,
        chartWeight: finalPoints / result.totalPoints * 100,
        display: { number: result.requiredPoints, unit: ' pts', caption: `of ${finalPoints} final points needed · ${formatPercent(result.requiredScore)} of the final` },
        note: `${pointsEarned} earned points out of ${pointsPossible} so far; ${result.totalPoints} points in the course after the final.`,
      };
    }

    if (activeMode === 'advanced') {
      const weighting = form.elements.namedItem('categoryWeighting').value;
      const categories = [...document.querySelectorAll('#category-list .category-card')].map((card) => ({
        name: card.querySelector('.category-title').value || 'Category',
        weight: weighting === 'unweighted' ? 1 : numberFromInput(card.querySelector('.category-course-weight'), 'Category weight'),
        assignments: [...card.querySelectorAll('.assignment-row')].map((row) => {
          const type = row.querySelector('.assignment-type').value;
          const score = type === 'missing' ? 0 : optionalNumber(row.querySelector('.assignment-score'));
          return {
            name: row.querySelector('.assignment-name').value,
            status: type === 'regular' ? 'graded' : type,
            score,
            weight: type === 'extra' ? 0 : numberFromInput(row.querySelector('.assignment-weight'), 'Assignment weight'),
          };
        }),
      }));
      const target = numberFrom(form, 'advancedTarget', 'Target grade');
      const result = calculateAdvancedGrade({
        categories,
        target,
        finalWeight: numberFrom(form, 'advancedWeight', 'Final or remaining work weight'),
        weighting,
        retakeRule: form.elements.namedItem('retakeRule').value,
      });
      return {
        mode: activeMode,
        ...result,
        current: result.currentGrade,
        target,
        chartContribution: result.currentCourseContribution,
        chartWeight: result.finalCourseWeight,
        display: {
          number: result.requiredScore,
          unit: '%',
          caption: result.status === 'already-achieved'
            ? 'Your earned contribution already meets your target.'
            : result.status === 'impossible'
              ? 'Your target exceeds the maximum possible course grade.'
              : 'average needed across remaining work to reach your target',
        },
        note: `Earned contribution: ${formatPercent(result.currentCourseContribution).replace('%', ' course points')} from ${formatPercent(result.completedCourseWeight)} completed course weight. ${formatPercent(target)} target − ${formatPercent(result.currentCourseContribution).replace('%', ' course points')} earned = ${formatPercent(Math.max(0, target - result.currentCourseContribution)).replace('%', ' course points')} still needed across ${formatPercent(result.remainingCourseWeight)} remaining weight. Required average: ${formatPercent(result.requiredScore)}. Maximum possible: ${formatPercent(result.maximumCourseGrade)}. Makeup work counts separately; retakes follow your selected rule.`,
      };
    }

    throw new RangeError('Choose a calculator mode.');
  };

  const statusText = (result) => {
    if (result.status === 'calculated') return 'Here’s your overall grade';
    if (result.status === 'already-achieved') return 'Your target is already covered';
    if (result.status === 'perfect-score') return 'This goal needs a perfect score';
    if (result.status === 'impossible') return 'Not possible with a perfect score';
    return 'Within reach — no perfect score needed';
  };

  const renderScenarios = (result) => {
    const body = document.querySelector('#scenario-body');
    body.replaceChildren();
    const scores = [50, 60, 70, 80, 90, 100];
    const row = make('tr');
    for (const score of scores) {
      const courseGrade = result.chartContribution + result.chartWeight * (score / 100);
      const scoreCell = make('td', 'scenario-score', `${score}%`);
      const gradeCell = make('td', 'scenario-grade', formatPercent(courseGrade));
      row.append(scoreCell, gradeCell);
    }
    body.append(row);
  };

  const renderChart = (result) => {
    const scores = [50, 60, 70, 80, 90, 100];
    const points = scores.map((score) => ({
      score,
      grade: result.chartContribution + result.chartWeight * (score / 100),
    }));
    const x = (score) => 52 + (score / 100) * 426;
    const y = (grade) => 164 - (Math.max(0, Math.min(100, grade)) / 100) * 136;
    document.querySelector('#chart-line').setAttribute('points', points.map((point) => `${x(point.score)},${y(point.grade)}`).join(' '));
    const grid = document.querySelector('#chart-grid');
    const labels = document.querySelector('#chart-labels');
    const markers = document.querySelector('#chart-points');
    grid.replaceChildren();
    labels.replaceChildren();
    markers.replaceChildren();
    for (const percent of [0, 50, 100]) {
      const line = make('line');
      line.setAttribute('x1', '48');
      line.setAttribute('x2', '480');
      line.setAttribute('y1', String(y(percent)));
      line.setAttribute('y2', String(y(percent)));
      line.classList.add('chart-grid-line');
      line.setAttribute('stroke-dasharray', percent === 0 ? '0' : '4 5');
      grid.append(line);
      const label = make('text', '', `${percent}%`);
      label.setAttribute('x', '2');
      label.setAttribute('y', String(y(percent) + 4));
      label.classList.add('chart-label');
      label.setAttribute('font-size', '11');
      labels.append(label);
    }
    for (const point of points) {
      const circle = make('circle');
      circle.classList.add('chart-point');
      circle.setAttribute('cx', String(x(point.score)));
      circle.setAttribute('cy', String(y(point.grade)));
      circle.setAttribute('r', '4.5');
      circle.setAttribute('stroke-width', '2.5');
      circle.setAttribute('tabindex', '0');
      circle.setAttribute('aria-label', `${point.score}% on the final gives ${formatPercent(point.grade)} overall`);
      markers.append(circle);
    }
    const description = points.map((point) => `${point.score}% on the final gives ${formatPercent(point.grade)} overall`).join('; ');
    document.querySelector('#chart-desc').textContent = description;
    document.querySelector('#chart-title').textContent = 'Calculated final score scenarios';
  };

  const renderConvertedGrade = (result) => {
    const row = document.querySelector('#converted-grade-row');
    const label = document.querySelector('#converted-grade');
    const style = document.querySelector('#grade-display').value;
    const thresholds = [...document.querySelectorAll('.threshold-row')].map((entry) => ({
      label: entry.querySelector('.threshold-label').value,
      minimum: entry.querySelector('.threshold-minimum').value,
      gpa: entry.querySelector('.threshold-gpa').value,
    })).filter((entry) => entry.label.trim() && entry.minimum.trim() !== '');
    if (style === 'percentage' || !Number.isFinite(result.current) || result.status === 'impossible' && result.requiredScore === null) {
      row.hidden = true;
      return;
    }
    try {
      if (style === 'letter') {
        const letter = calculateLetterGrade(result.target, thresholds);
        row.hidden = !letter;
        label.textContent = letter ? `${letter} · ${formatPercent(result.target)}` : '';
      } else {
        const gpa = calculateGpa(result.target, thresholds);
        const maximum = document.querySelector('#gpa-scale').value === 'custom'
          ? Number(document.querySelector('#custom-gpa-max').value)
          : Number(document.querySelector('#gpa-scale').value);
        row.hidden = gpa === null;
        if (gpa !== null && (!Number.isFinite(maximum) || maximum <= 0 || gpa > maximum)) {
          throw new RangeError('GPA thresholds must fit within your selected GPA scale.');
        }
        label.textContent = gpa === null ? '' : `${gpa} / ${maximum} · ${formatPercent(result.target)}`;
      }
    } catch (error) {
      row.hidden = true;
      setError(error.message);
    }
  };

  const updateResult = () => {
    try {
      const result = formState();
      latestResult = result;
      setError('');
      const scoreElement = document.querySelector('#result-number');
      scoreElement.textContent = result.display.number === null || !Number.isFinite(result.display.number)
        ? '—'
        : String(Number(result.display.number.toFixed(1)));
      document.querySelector('#result-unit').textContent = result.display.unit;
      document.querySelector('#result-caption').textContent = result.display.caption;
      const status = document.querySelector('#result-status');
      status.textContent = statusText(result);
      status.dataset.status = result.status;
      document.querySelector('#fact-current').textContent = formatPercent(result.current);
      document.querySelector('#fact-current').parentElement.querySelector('dt').textContent = activeMode === 'advanced' ? 'Current overall grade' : 'Your current grade';
      document.querySelector('#fact-target').textContent = formatPercent(result.target);
      document.querySelector('#fact-weight').textContent = formatPercent(result.chartWeight);
      document.querySelector('#fact-weight').parentElement.querySelector('dt').textContent = activeMode === 'points'
        ? 'Final share of course points'
        : activeMode === 'components'
          ? 'Remaining component weight'
          : activeMode === 'advanced'
            ? 'Remaining work weight'
            : 'Final exam weight';
      document.querySelector('#fact-target').parentElement.querySelector('dt').textContent = activeMode === 'overall' ? 'Calculated course grade' : 'Your target grade';
      document.querySelector('#fact-maximum').textContent = formatPercent(result.maximumCourseGrade);
      const advancedResult = activeMode === 'advanced';
      document.querySelector('#advanced-earned-row').hidden = !advancedResult;
      document.querySelector('#advanced-completed-row').hidden = !advancedResult;
      if (advancedResult) {
        document.querySelector('#fact-earned').textContent = `${formatPercent(result.currentCourseContribution).replace('%', '')} pts`;
        document.querySelector('#fact-completed').textContent = formatPercent(result.completedCourseWeight);
      }
      const note = result.note || `Your current work contributes ${formatPercent(result.chartContribution)}. The remaining work can contribute up to ${formatPercent(result.chartWeight)}.`;
      document.querySelector('#calculation-note').textContent = note;
      if (activeMode === 'required') {
        const weight = numberFrom(form, 'weight', 'Final exam weight');
        const current = numberFrom(form, 'current', 'Current grade');
        document.querySelector('.mode-note').textContent = `The final is worth ${formatPercent(weight)} of your course grade. Your current ${formatPercent(current)} makes up the other ${formatPercent(100 - weight)}.`;
      }
      renderScenarios(result);
      renderChart(result);
      renderConvertedGrade(result);
      return result;
    } catch (error) {
      latestResult = null;
      setError(error instanceof Error ? error.message : 'Check your inputs and try again.');
      document.querySelector('#result-status').textContent = 'Check your inputs';
      document.querySelector('#result-status').dataset.status = 'error';
      document.querySelector('#result-number').textContent = '—';
      document.querySelector('#result-unit').textContent = '';
      document.querySelector('#result-caption').textContent = 'Correct the highlighted values to see your result.';
      document.querySelector('#scenario-body').replaceChildren();
      document.querySelector('#chart-line').setAttribute('points', '');
      document.querySelector('#chart-points').replaceChildren();
      return null;
    }
  };

  const saveRecent = (result) => {
    if (!storageAvailable()) return;
    try {
      const entries = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      entries.unshift({
        mode: result.mode,
        status: result.status,
        number: result.display.number,
        unit: result.display.unit,
        caption: result.display.caption,
        current: result.current,
        target: result.target,
        date: new Date().toISOString(),
      });
      localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
      renderHistory();
    } catch {
      announce('This calculation could not be saved in your browser.');
    }
  };

  const renderHistory = () => {
    const section = document.querySelector('#recent');
    const list = document.querySelector('#recent-list');
    if (!storageAvailable()) return;
    try {
      const entries = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      if (!Array.isArray(entries) || entries.length === 0) {
        section.hidden = true;
        return;
      }
      list.replaceChildren();
      for (const entry of entries.slice(0, MAX_HISTORY)) {
        const item = make('li', 'recent-item');
        const details = make('span', 'recent-item-copy', `${entry.caption} · ${formatPercent(entry.current)} current`);
        const value = make('strong', 'recent-item-result', `${entry.number ?? '—'}${entry.unit || ''}`);
        const date = make('time', 'recent-item-date', new Date(entry.date).toLocaleDateString('en-US'));
        date.dateTime = entry.date;
        item.append(details, value, date);
        list.append(item);
      }
      section.hidden = false;
    } catch {
      localStorage.removeItem(HISTORY_KEY);
      section.hidden = true;
      announce('Saved calculation history could not be read and was cleared.');
    }
  };

  const addSimpleRow = (container, type, index) => {
    const row = make('div', `score-row${type === 'component' ? ' component-row' : ''}`);
    const score = make('input');
    score.type = 'number';
    score.min = '0';
    score.max = '100';
    score.step = 'any';
    score.className = type === 'component' ? 'component-score' : type === 'drop' ? 'drop-score' : 'test-score';
    score.placeholder = type === 'component' ? '—' : '';
    score.setAttribute('aria-label', `${type === 'component' ? 'Component' : 'Score'} ${index} score`);
    if (type !== 'component') score.value = '85';
    const scoreLabel = make('label');
    scoreLabel.append(score, make('b', '', '%'));
    const divider = make('span', 'row-divider', 'at');
    const weight = make('input');
    weight.type = 'number';
    weight.min = '0.01';
    weight.step = 'any';
    weight.value = type === 'component' ? '10' : '1';
    weight.className = type === 'component' ? 'component-weight' : type === 'drop' ? 'drop-weight' : 'test-weight';
    weight.setAttribute('aria-label', `${type === 'component' ? 'Component' : 'Score'} ${index} weight`);
    const weightLabel = make('label');
    weightLabel.append(weight, make('b', '', type === 'component' ? '%' : '×'));
    row.append(scoreLabel, divider, weightLabel);
    if (type === 'component') {
      const name = make('input', 'row-name');
      name.type = 'text';
      name.value = `Component ${index}`;
      name.setAttribute('aria-label', `Component ${index} name`);
      row.append(name);
    } else {
      const remove = make('button', 'icon-button remove-row', '×');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove score ${index}`);
      row.append(remove);
    }
    container.append(row);
  };

  const addCategory = () => {
    const card = make('article', 'category-card');
    card.innerHTML = '<div class="category-top"><label class="category-name"><span>Category name</span><input type="text" class="category-title" value="New category" maxlength="40"></label><label class="category-weight"><span>Course weight</span><span class="input-wrap"><input class="category-course-weight" type="number" min="0" max="100" step="any" value="10"><b>%</b></span></label><button type="button" class="icon-button remove-category" aria-label="Remove category">×</button></div><div class="assignment-list"></div><button type="button" class="add-assignment">＋ Add assignment</button>';
    document.querySelector('#category-list').append(card);
    addAssignment(card.querySelector('.assignment-list'));
  };

  const updateAssignmentRow = (row) => {
    const type = row.querySelector('.assignment-type').value;
    const score = row.querySelector('.assignment-score');
    const weight = row.querySelector('.assignment-weight');
    const extraCredit = type === 'extra';
    const missing = type === 'missing';
    weight.hidden = extraCredit;
    weight.disabled = extraCredit;
    score.disabled = missing;
    score.placeholder = extraCredit ? 'Bonus % points' : missing ? 'Counts as 0%' : 'Score %';
    score.setAttribute('aria-label', extraCredit ? 'Extra-credit category percentage points' : missing ? 'Missing assignment score, counted as zero' : 'Assignment score percentage');
  };

  const addAssignment = (list) => {
    const row = make('div', 'assignment-row');
    row.innerHTML = '<input aria-label="Assignment name" class="assignment-name" type="text" placeholder="Assignment name" maxlength="60"><input aria-label="Assignment score" class="assignment-score" type="number" min="0" max="100" step="any" placeholder="Score %"><input aria-label="Assignment relative weight" class="assignment-weight" type="number" min="0.01" step="any" value="1" placeholder="Weight"><select aria-label="Assignment type" class="assignment-type"><option value="regular">Graded</option><option value="missing">Missing (0)</option><option value="makeup">Makeup</option><option value="retake">Retake</option><option value="extra">Extra credit</option></select><button class="icon-button remove-assignment" type="button" aria-label="Remove assignment">×</button>';
    list.append(row);
    updateAssignmentRow(row);
  };

  const addThreshold = (values = {}) => {
    const row = make('div', 'threshold-row');
    const labelField = make('label');
    labelField.append(make('span', '', 'Letter grade'), Object.assign(make('input', 'threshold-label'), { type: 'text', value: values.label || '', maxlength: 12, placeholder: 'A', 'aria-label': 'Letter grade' }));
    const minimumField = make('label');
    minimumField.append(make('span', '', 'Minimum course %'), Object.assign(make('input', 'threshold-minimum'), { type: 'number', min: '0', max: '100', step: 'any', value: values.minimum ?? '', placeholder: '90', 'aria-label': 'Minimum overall course percentage for this grade' }));
    const gpaField = make('label');
    gpaField.append(make('span', '', 'GPA value'), Object.assign(make('input', 'threshold-gpa'), { type: 'number', min: '0', step: 'any', value: values.gpa ?? '', placeholder: 'e.g. 4.0', 'aria-label': 'GPA value for this cutoff' }));
    const remove = make('button', 'remove-threshold', 'Remove');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${values.label || 'grade'} cutoff`);
    labelField.hidden = document.querySelector('#grade-display').value === 'gpa';
    gpaField.hidden = document.querySelector('#grade-display').value !== 'gpa';
    row.append(labelField, minimumField, gpaField, remove);
    document.querySelector('#threshold-list').append(row);
  };

  const saveSettings = () => {
    if (!storageAvailable()) return;
    try {
      const settings = {
        display: document.querySelector('#grade-display').value,
        scale: document.querySelector('#gpa-scale').value,
        customMax: document.querySelector('#custom-gpa-max').value,
        thresholds: [...document.querySelectorAll('.threshold-row')].map((row) => ({
          label: row.querySelector('.threshold-label').value,
          minimum: row.querySelector('.threshold-minimum').value,
          gpa: row.querySelector('.threshold-gpa').value,
        })),
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      announce('Your grading preferences could not be saved.');
    }
  };

  const loadSettings = () => {
    if (!storageAvailable()) return;
    try {
      const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      if (!settings || typeof settings !== 'object') return;
      document.querySelector('#grade-display').value = settings.display || 'percentage';
      document.querySelector('#gpa-scale').value = settings.scale || '4';
      document.querySelector('#custom-gpa-max').value = settings.customMax || '4';
      for (const threshold of settings.thresholds || []) addThreshold(threshold);
      updateGradingControls();
    } catch {
      localStorage.removeItem(SETTINGS_KEY);
      announce('Saved grading preferences could not be read and were cleared.');
    }
  };

  const updateGradingControls = () => {
    const display = document.querySelector('#grade-display').value;
    document.querySelector('#gpa-scale-field').hidden = display !== 'gpa';
    document.querySelector('#custom-gpa-field').hidden = display !== 'gpa' || document.querySelector('#gpa-scale').value !== 'custom';
    document.querySelector('#threshold-editor').hidden = display === 'percentage';
    document.querySelector('#threshold-prompt').hidden = display !== 'percentage';
    document.querySelector('#threshold-list').dataset.display = display;
    document.querySelector('#threshold-help').textContent = display === 'gpa'
      ? 'Each row maps a minimum overall course percentage to its GPA value. Example: 90% → 4.0 means a 90% course result displays as 4.0 GPA. Enter the cutoffs from your school; the calculator does not guess or convert them.'
      : 'Each row is a rule: if your overall course percentage meets that minimum, show the letter grade. Example: A at 90% means a result of 90% or higher displays as A. Enter the cutoffs from your school; the required exam score is still calculated as a percentage.';
    for (const row of document.querySelectorAll('.threshold-row')) {
      const labelField = row.querySelector('.threshold-label').closest('label');
      const gpaField = row.querySelector('.threshold-gpa').closest('label');
      labelField.hidden = display === 'gpa';
      gpaField.hidden = display !== 'gpa';
    }
    saveSettings();
    updateResult();
  };

  const updateAdvancedWeighting = () => {
    const unweighted = form.elements.namedItem('categoryWeighting').value === 'unweighted';
    for (const input of document.querySelectorAll('.category-course-weight')) input.disabled = unweighted || activeMode !== 'advanced';
    document.querySelector('#advanced-help').textContent = unweighted
      ? 'Categories count equally across the course weight not yet represented by final/remaining work. Assignment weights are relative within each category. Blank scores are remaining work; missing scores count as zero. Extra credit adds percentage points to its category once, without an assignment weight. Makeup counts separately. Name a retake like its original; the last retake row is the latest.'
      : 'Category weights plus final/remaining work must total 100%. Assignment weights are relative within a category. Blank scores are remaining work; missing scores count as zero. Extra credit adds percentage points to its category once, without an assignment weight. Makeup counts separately. Name a retake like its original; the last retake row is the latest.';
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => setMode(tab.dataset.mode));
    tab.addEventListener('keydown', (event) => {
      const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + direction + tabs.length) % tabs.length;
      if (direction || event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        tabs[nextIndex].focus();
        setMode(tabs[nextIndex].dataset.mode);
      }
    });
    form.elements.namedItem('categoryWeighting').addEventListener('change', () => {
      updateAdvancedWeighting();
      updateResult();
    });
  });

  form.addEventListener('input', () => updateResult());
  form.addEventListener('change', () => updateResult());
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const panel = document.querySelector(`[data-panel="${activeMode}"]`);
    const invalid = [...panel.querySelectorAll('input:enabled, select:enabled')].find((input) => !input.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      invalid.focus();
      return;
    }
    const result = updateResult();
    if (result) {
      saveRecent(result);
      document.querySelector('#result-status').focus?.();
    }
  });

  document.querySelector('#add-test').addEventListener('click', () => {
    addSimpleRow(document.querySelector('#test-rows'), 'test', document.querySelectorAll('#test-rows .score-row').length + 1);
    updateResult();
  });
  document.querySelector('#add-drop-score').addEventListener('click', () => {
    addSimpleRow(document.querySelector('#drop-rows'), 'drop', document.querySelectorAll('#drop-rows .score-row').length + 1);
    updateResult();
  });
  document.querySelector('#add-component').addEventListener('click', () => {
    addSimpleRow(document.querySelector('#component-rows'), 'component', document.querySelectorAll('#component-rows .score-row').length + 1);
    updateResult();
  });
  document.querySelector('#add-category').addEventListener('click', () => {
    addCategory();
    updateResult();
  });
  document.querySelector('#category-list').addEventListener('click', (event) => {
    const target = event.target;
    if (target.closest('.add-assignment')) {
      addAssignment(target.closest('.category-card').querySelector('.assignment-list'));
      updateResult();
    } else if (target.closest('.remove-category')) {
      target.closest('.category-card').remove();
      updateResult();
    } else if (target.closest('.remove-assignment')) {
      target.closest('.assignment-row').remove();
      updateResult();
    }
  });
  document.querySelector('#category-list').addEventListener('input', () => updateResult());
  document.querySelector('#category-list').addEventListener('change', (event) => {
    if (event.target.closest('.assignment-type')) updateAssignmentRow(event.target.closest('.assignment-row'));
    updateResult();
  });
  for (const selector of ['#test-rows', '#drop-rows', '#component-rows']) {
    document.querySelector(selector).addEventListener('click', (event) => {
      if (!event.target.closest('.remove-row')) return;
      const rows = [...event.currentTarget.querySelectorAll('.score-row')];
      if (rows.length <= 1) {
        announce('Keep at least one score or component.');
        return;
      }
      event.target.closest('.score-row').remove();
      updateResult();
    });
  }
  document.querySelector('#threshold-list').addEventListener('input', () => {
    saveSettings();
    updateResult();
  });
  document.querySelector('#threshold-list').addEventListener('click', (event) => {
    if (event.target.closest('.remove-threshold')) {
      event.target.closest('.threshold-row').remove();
      saveSettings();
      updateResult();
    }
  });
  document.querySelector('#add-threshold').addEventListener('click', () => {
    addThreshold();
    const selector = document.querySelector('#grade-display').value === 'gpa' ? '.threshold-minimum' : '.threshold-label';
    document.querySelector(`#threshold-list .threshold-row:last-child ${selector}`).focus();
  });
  for (const selector of ['#grade-display', '#gpa-scale', '#custom-gpa-max']) {
    document.querySelector(selector).addEventListener('change', updateGradingControls);
    document.querySelector(selector).addEventListener('input', updateGradingControls);
  }

  document.querySelector('#copy-result').addEventListener('click', async () => {
    const result = latestResult || updateResult();
    if (!result) return;
    const text = `Final grade calculator: ${result.display.number ?? '—'}${result.display.unit} ${result.display.caption}. Current grade: ${formatPercent(result.current)}. Target: ${formatPercent(result.target)}.`;
    try {
      await navigator.clipboard.writeText(text);
      announce('Result copied to clipboard.');
    } catch {
      announce('Clipboard access is unavailable in this browser. You can select and copy the result manually.');
    }
  });
  document.querySelector('#share-result').addEventListener('click', async () => {
    const result = latestResult || updateResult();
    if (!result) return;
    const shareData = {
      title: 'Final Grade Calculator result',
      text: `${result.display.number ?? '—'}${result.display.unit} ${result.display.caption}.`,
      url: window.location.href.split('#')[0],
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
        announce('Share text and link copied.');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') announce('Sharing is unavailable. Try copying your result instead.');
    }
  });

  document.querySelector('#reset-calculator').addEventListener('click', () => {
    form.reset();
    for (const [selector, html] of initialRows) document.querySelector(selector).innerHTML = html;
    if (initialCategories) document.querySelector('#category-list').innerHTML = initialCategories.innerHTML;
    form.elements.namedItem('categoryWeighting').value = 'weighted';
    setMode('required');
    updateAdvancedWeighting();
    form.elements.namedItem('current').focus();
    updateResult();
    announce('Calculator reset.');
  });
  document.querySelector('#clear-history').addEventListener('click', () => {
    try {
      localStorage.removeItem(HISTORY_KEY);
      renderHistory();
      announce('Recent calculations cleared.');
    } catch {
      announce('Your browser could not clear saved history.');
    }
  });

  for (const row of document.querySelectorAll('#category-list .assignment-row')) updateAssignmentRow(row);
  for (const panel of panels) {
    for (const input of panel.querySelectorAll('input, select, textarea, button')) {
      if (panel.dataset.panel !== activeMode) input.disabled = true;
    }
    tabs.forEach((tab) => { tab.tabIndex = tab.dataset.mode === activeMode ? 0 : -1; });
    updateAdvancedWeighting();
    panel.setAttribute('aria-hidden', String(panel.dataset.panel !== activeMode));
  }
  loadSettings();
  renderHistory();
  updateResult();
}
