const BASE_WORDS = window.VocabApp.WORDS;
const BASE_WORDS_BY_ID = new Map(BASE_WORDS.map((w) => [w.id, w]));
const store = window.VocabApp.store;
const { newCard, recordAnswer, isDue, dueDate, isWeekend, isMastered, INTERVAL_DAYS } = window.VocabApp.srs;
const { buildQuestion, checkAnswer, findSameMeaningWord, shuffle, speak, QUESTION_TYPES } = window.VocabApp.quiz;

const FREE_PRACTICE_SIZE = 15;
const NEW_WORDS_PER_DAY = 20;
const MIN_NEW_PER_SESSION = 7;
const MAX_SESSION_SIZE = 30;
const EMOJIS = ["🐶", "🐱", "🐰", "🐻", "🦊", "🐼", "🦁", "🐸", "🐵", "🐯", "🦄", "🐧"];

const TYPE_LABEL = {
  meaning_choice: "단어를 보고 뜻을 고르세요",
  word_choice: "뜻을 보고 단어를 고르세요",
  spelling_choice: "빈칸에 알맞은 철자를 고르세요",
  spelling_type: "뜻에 맞는 단어를 써 보세요",
};

const el = (id) => document.getElementById(id);

const screens = {
  users: el("screen-users"),
  dashboard: el("screen-dashboard"),
  quiz: el("screen-quiz"),
  result: el("screen-result"),
  stats: el("screen-stats"),
  mywords: el("screen-mywords"),
  help: el("screen-help"),
};

let state = {
  user: null,
  progress: {},
  stats: {},
  session: [],
  sessionItems: [],
  screen: "users",
  screenBeforeHelp: "users",
  reviewMode: false,
  index: 0,
  answered: false,
  result: { correct: 0, wrong: 0, wrongWords: [] },
  selectedEmoji: EMOJIS[0],
  // 사용자별 단어 목록: 기본 단어 + 사용자가 뜻을 입력해 추가한 단어
  words: BASE_WORDS,
  wordsById: BASE_WORDS_BY_ID,
  priorityIds: new Set(),
  myWords: { priority: [], custom: [] },
};

function showScreen(name) {
  state.screen = name;
  Object.values(screens).forEach((s) => s.classList.add("hidden"));
  screens[name].classList.remove("hidden");
  document.body.classList.toggle("quiz-mode", name === "quiz");
  el("btn-switch-user").classList.toggle("hidden", name !== "dashboard" && name !== "stats");
  el("btn-help").classList.toggle("hidden", name === "quiz" || name === "help");
  window.scrollTo(0, 0);
}

function openHelp() {
  state.screenBeforeHelp = state.screen;
  showScreen("help");
}

// 제목을 누르면 어디서든 첫 화면으로. 문제를 풀던 중이면 먼저 확인하고,
// 이번 세션에서 아직 풀지 않은 새 문제만큼 오늘의 새 단어 한도를 돌려준다.
function goHome() {
  if (state.screen === "quiz") {
    if (!confirm("학습을 그만두고 처음 화면으로 갈까요?\n지금까지 푼 문제는 저장돼요.")) return;
    const firstUnanswered = state.answered ? state.index + 1 : state.index;
    const unusedNew = state.sessionItems.slice(firstUnanswered).filter((it) => it.isNew).length;
    if (unusedNew && !state.reviewMode) {
      state.stats.newWordsToday = Math.max(0, state.stats.newWordsToday - unusedNew);
      store.saveStats(state.user.id, state.stats);
    }
  }
  state.reviewMode = false;
  renderUserList();
  showScreen("users");
}

function deleteCurrentUser() {
  const { id, name } = state.user;
  if (!confirm(`"${name}" 프로필과 모든 학습 기록을 삭제할까요?\n\n삭제하면 되돌릴 수 없어요. 필요하면 먼저 첫 화면의 "기록 내보내기"로 백업하세요.`)) {
    return;
  }
  store.deleteUser(id);
  state.user = null;
  renderUserList();
  showScreen("users");
}

// ---------- 사용자 선택 ----------

function renderUserList() {
  const users = store.getUsers();
  const list = el("user-list");
  list.innerHTML = "";
  users.forEach((u) => {
    const card = document.createElement("div");
    card.className = "user-card";
    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.textContent = u.avatar || EMOJIS[0];
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = u.name;
    card.append(avatar, name);
    card.addEventListener("click", () => selectUser(u.id));
    list.appendChild(card);
  });
}

function renderEmojiPicker() {
  const picker = el("emoji-picker");
  picker.innerHTML = "";
  EMOJIS.forEach((e) => {
    const span = document.createElement("span");
    span.textContent = e;
    if (e === state.selectedEmoji) span.classList.add("selected");
    span.addEventListener("click", () => {
      state.selectedEmoji = e;
      renderEmojiPicker();
    });
    picker.appendChild(span);
  });
}

function selectUser(userId) {
  const user = store.getUsers().find((u) => u.id === userId);
  if (!user) return;
  state.user = user;
  state.progress = store.getProgress(userId);
  state.stats = store.getStats(userId);
  loadUserWords();
  renderDashboard();
  showScreen("dashboard");
}

const WORD_PATTERN = /^[A-Za-z][A-Za-z .'-]*$/;
const MAX_WORD_LENGTH = 30;

const makeCustomWord = (en, ko) => ({ id: en.toLowerCase(), en, ko, cat: en[0].toUpperCase() });

function loadUserWords() {
  const my = store.getMyWords(state.user.id);
  const custom = my.custom
    .filter(
      (w) =>
        typeof w.en === "string" && WORD_PATTERN.test(w.en) && w.en.length <= MAX_WORD_LENGTH &&
        typeof w.ko === "string" && w.ko.trim() &&
        !BASE_WORDS_BY_ID.has(w.en.toLowerCase())
    )
    .map((w) => makeCustomWord(w.en, w.ko.trim()));
  state.myWords = { priority: my.priority, custom };
  state.words = [...BASE_WORDS, ...custom];
  state.wordsById = new Map(state.words.map((w) => [w.id, w]));
  state.priorityIds = new Set(my.priority.filter((id) => state.wordsById.has(id)));
}

// ---------- 대시보드 ----------

// (단어, 문제유형) 쌍 하나하나를 독립된 카드로 보고, 실제로 한 번이라도 푼 적 있는
// 카드 중 복습 기한(next)이 된 것만 모은다. 아직 한 번도 안 푼 유형은 여기 포함하지
// 않고, 아래 computeNewCandidates()의 "신규" 후보로 보내 하루 도입 한도를 통과하게 한다.
function computeDueItems() {
  const items = [];
  state.words.forEach((w) => {
    const rec = state.progress[w.id];
    if (!rec) return;
    QUESTION_TYPES.forEach((type) => {
      const card = rec[type];
      if (card && isDue(card)) items.push({ word: w, type, next: dueDate(card), level: card.level });
    });
  });
  return items;
}

// 아직 한 번도 안 푼 (단어, 문제유형) 쌍의 후보를 두 갈래로 나눈다.
// - fresh: 처음 보는 단어. 네 유형 중 하나를 무작위로 골라 첫 문제로 낸다.
// - expand: 이미 배운 단어의 아직 안 푼 유형. 오늘 이미 푼 단어는 빼서 다음 날부터 나오게 한다.
// 두 갈래 모두 사용자가 정한 우선 학습 단어가 먼저, 나머지는 무작위 순서다.
function computeNewCandidates() {
  const today = store.todayStr();
  const priorityExpand = [];
  const otherExpand = [];
  const priorityFresh = [];
  const otherFresh = [];
  state.words.forEach((w) => {
    const isPriority = state.priorityIds.has(w.id);
    const rec = state.progress[w.id];
    if (!rec) {
      const pair = { word: w, type: QUESTION_TYPES[Math.floor(Math.random() * QUESTION_TYPES.length)] };
      (isPriority ? priorityFresh : otherFresh).push(pair);
      return;
    }
    if (Object.values(rec).some((card) => card && card.lastSeen === today)) return;
    QUESTION_TYPES.forEach((type) => {
      if (!rec[type]) (isPriority ? priorityExpand : otherExpand).push({ word: w, type });
    });
  });
  return {
    fresh: [...shuffle(priorityFresh), ...shuffle(otherFresh)],
    expand: [...shuffle(priorityExpand), ...shuffle(otherExpand)],
  };
}

// 신규 자리의 절반(홀수면 하나 더)은 새 단어, 나머지 절반은 배운 단어의 다른 유형으로 채운다.
// 한쪽 후보가 모자라면 다른 쪽으로 채운다.
function splitNewSlots(total, freshAvail, expandAvail) {
  const expand = Math.min(expandAvail, Math.max(total - Math.ceil(total / 2), total - freshAvail));
  const fresh = Math.min(freshAvail, total - expand);
  return { fresh, expand };
}

const sortReviews = (dueItems) =>
  shuffle(dueItems).sort((a, b) => (a.next < b.next ? -1 : a.next > b.next ? 1 : a.level - b.level));

// 오늘의 학습 한 세션의 구성. 신규 자리는 하루 20개 한도 안에서 복습이 적으면 많이,
// 복습이 많아도 최소 7개. 복습은 신규를 뺀 자리만큼(총 30문제)만 가장 오래 밀린 것부터 넣는다.
// 새 문제는 그날 첫 학습에만 넣고, 그 뒤의 학습은 남은 복습만 푼다(복습이 끝나면 그날 학습도 끝).
// 주말(토/일)에는 새 복습이 돌아오지 않으므로, 밀린 복습이 남아 있을 때만 학습할 수 있다.
// 같은 세션에서 한 단어가 복습과 다른 유형으로 두 번 나오지 않도록, 복습에 들어간 단어는
// "다른 유형" 후보에서 뺀다. 대시보드의 숫자도 이 함수로 계산해 실제 세션과 맞춘다.
function planStudySession() {
  const due = sortReviews(computeDueItems());
  const newAlreadyGiven = state.stats.newWordsToday > 0;
  if (isWeekend(store.todayStr()) && due.length === 0) return { dueCount: 0, reviews: [], newItems: [] };
  if (newAlreadyGiven) return { dueCount: due.length, reviews: due.slice(0, MAX_SESSION_SIZE), newItems: [] };
  const budget = Math.min(NEW_WORDS_PER_DAY, Math.max(MIN_NEW_PER_SESSION, NEW_WORDS_PER_DAY - due.length));
  const { fresh, expand } = computeNewCandidates();

  const firstTotal = Math.min(budget, fresh.length + expand.length);
  const reviewWordIds = new Set(due.slice(0, MAX_SESSION_SIZE - firstTotal).map((it) => it.word.id));
  const expandOk = expand.filter((it) => !reviewWordIds.has(it.word.id));

  const newTotal = Math.min(budget, fresh.length + expandOk.length);
  const split = splitNewSlots(newTotal, fresh.length, expandOk.length);
  const newItems = [...fresh.slice(0, split.fresh), ...expandOk.slice(0, split.expand)];
  return { dueCount: due.length, reviews: due.slice(0, MAX_SESSION_SIZE - newItems.length), newItems };
}

// 오늘 학습을 마친 뒤 밀린 복습을 더 풀 때처럼 신규 없이 복습만 고를 때
function pickReviews(dueItems, newCount) {
  return sortReviews(dueItems).slice(0, Math.max(0, MAX_SESSION_SIZE - newCount));
}

function isWordMastered(wordId) {
  const rec = state.progress[wordId];
  if (!rec) return false;
  return QUESTION_TYPES.every((t) => rec[t] && isMastered(rec[t]));
}

function renderDashboard() {
  el("dash-avatar").textContent = state.user.avatar;
  el("dash-name").textContent = `${state.user.name}님`;

  // 학습한 단어 수는 실제 단어 개수(통계의 "배운 단어"와 같음). 복습/새 단어 수는 실제로 풀게 될
  // 문제 개수와 맞추기 위해 (단어, 문제유형) 쌍 단위로 센다.
  const learned = state.words.filter((w) => state.progress[w.id]).length;
  const plan = planStudySession();
  const due = plan.dueCount;
  const newAvail = plan.newItems.length;
  const reviewToday = plan.reviews.length;

  el("stat-learned").textContent = learned;
  el("stat-due").textContent = due;
  el("stat-new").textContent = newAvail;
  el("stat-streak").textContent = `${state.stats.streak || 0}🔥`;

  const nothingToStudy = due === 0 && newAvail === 0;
  const emptyMsg = el("dash-empty-msg");
  emptyMsg.classList.toggle("hidden", !nothingToStudy);
  emptyMsg.textContent = state.stats.newWordsToday > 0
    ? "오늘 학습을 모두 마쳤어요! 내일 또 만나요. 자유 연습은 언제든 할 수 있어요."
    : isWeekend(store.todayStr())
    ? "주말에는 밀린 복습이 있을 때만 학습할 수 있어요. 오늘은 푹 쉬거나 자유 연습을 해 볼까요?"
    : "오늘 복습할 단어가 없어요! 자유 연습으로 더 배워볼까요?";
  el("btn-start-study").disabled = nothingToStudy;

  const backlog = el("dash-backlog-msg");
  backlog.classList.toggle("hidden", due <= reviewToday);
  backlog.textContent = `밀린 복습이 모두 ${due}개예요. 학습을 마친 뒤 "남은 복습 더 하기"로 ${MAX_SESSION_SIZE}개씩 이어서 풀 수 있어요.`;

  const priorityCount = state.priorityIds.size;
  el("btn-mywords").textContent = priorityCount ? `⭐ 우선 학습 단어 (${priorityCount})` : "⭐ 우선 학습 단어";
}

// ---------- 통계 ----------

function renderStats() {
  el("stats-avatar").textContent = state.user.avatar;
  el("stats-name").textContent = `${state.user.name}님의 통계`;

  const startedCount = state.words.filter((w) => state.progress[w.id]).length;
  const masteredCount = state.words.filter((w) => isWordMastered(w.id)).length;
  const accuracy = state.stats.totalAnswered
    ? Math.round((state.stats.totalCorrect / state.stats.totalAnswered) * 100) + "%"
    : "-";

  el("stats-started").textContent = `${startedCount}/${state.words.length}`;
  el("stats-mastered").textContent = masteredCount;
  el("stats-accuracy").textContent = accuracy;
  el("stats-longest-streak").textContent = `${state.stats.longestStreak || 0}🔥`;

  window.VocabApp.statsView.render({
    todayStr: store.todayStr(),
    words: state.words,
    progress: state.progress,
    stats: state.stats,
    priorityIds: state.priorityIds,
    types: QUESTION_TYPES,
    maxLevel: INTERVAL_DAYS.length - 1,
    dailyCap: MAX_SESSION_SIZE,
    dueDate,
    isMastered,
  });
}

function buildStudyItems() {
  const plan = planStudySession();
  const reviews = plan.reviews;
  const newItems = plan.newItems.map((it) => ({ ...it, isNew: true }));
  if (newItems.length) {
    state.stats.newWordsToday += newItems.length;
    store.saveStats(state.user.id, state.stats);
  }
  return shuffle([...reviews, ...newItems]);
}

function buildFreePracticeItems() {
  return shuffle(state.words)
    .slice(0, FREE_PRACTICE_SIZE)
    .map((w) => ({ word: w, type: QUESTION_TYPES[Math.floor(Math.random() * QUESTION_TYPES.length)] }));
}

// 오늘 학습을 마친 뒤 밀린 복습을 더 풀고 싶을 때: 새 단어 없이 복습만 30개씩(오래 밀린 것부터)
function buildMoreReviewItems() {
  return pickReviews(computeDueItems(), 0);
}

// mode: "study"(오늘의 학습) | "free"(자유 연습) | "review"(남은 복습 더 하기)
function startSession(mode) {
  const builders = { study: buildStudyItems, free: buildFreePracticeItems, review: buildMoreReviewItems };
  const items = builders[mode]();
  if (items.length === 0) return;

  state.stats = store.recordStudyDay(state.stats);
  store.saveStats(state.user.id, state.stats);

  state.reviewMode = false;
  state.sessionItems = items;
  state.session = items.map(({ word, type }) => buildQuestion(word, state.words, type));
  state.index = 0;
  state.result = { correct: 0, wrong: 0, wrongWords: [] };
  showScreen("quiz");
  renderQuestion();
}

// 복습 주기와 무관하게, 오늘 하루 동안 틀린 문제만 모아서 다시 풀어보는 보너스 라운드.
// 정답 기록·SRS 일정·통계에는 전혀 반영되지 않는다.
function startWrongReview() {
  const items = (state.stats.wrongToday || [])
    .map(({ wordId, type }) => ({ word: state.wordsById.get(wordId), type }))
    .filter((it) => it.word);
  if (!items.length) return;
  state.reviewMode = true;
  state.sessionItems = items;
  state.session = items.map(({ word, type }) => buildQuestion(word, state.words, type));
  state.index = 0;
  state.result = { correct: 0, wrong: 0, wrongWords: [] };
  showScreen("quiz");
  renderQuestion();
}

// ---------- 퀴즈 ----------

function renderQuestion() {
  state.answered = false;
  const q = state.session[state.index];
  el("progress-text").textContent = `${state.index + 1} / ${state.session.length}`;
  el("progress-fill").style.width = `${(state.index / state.session.length) * 100}%`;
  const feedback = el("quiz-feedback");
  feedback.textContent = "";
  feedback.classList.remove("correct", "wrong", "notice");
  feedback.style.setProperty("--fit", "1");
  el("btn-next").disabled = true;

  const card = el("quiz-card");
  card.innerHTML = "";

  const label = document.createElement("div");
  label.className = "quiz-type-label";
  label.textContent = TYPE_LABEL[q.type];
  card.appendChild(label);

  if (q.type === "meaning_choice") {
    card.appendChild(makePrompt(q.prompt));
    card.appendChild(makeOptionsGrid(q.options, (val, btn) => handleAnswer(q, val, btn)));
  } else if (q.type === "word_choice") {
    card.appendChild(makePrompt(q.prompt, q.hint));
    card.appendChild(makeOptionsGrid(q.options, (val, btn) => handleAnswer(q, val, btn)));
  } else if (q.type === "spelling_choice") {
    const meaning = document.createElement("div");
    meaning.className = "quiz-prompt small";
    meaning.textContent = q.prompt;
    appendHint(meaning, q.hint);
    card.appendChild(meaning);
    const masked = document.createElement("div");
    masked.className = "quiz-prompt";
    masked.textContent = q.masked;
    card.appendChild(masked);
    card.appendChild(makeOptionsGrid(q.options, (val, btn) => handleAnswer(q, val, btn)));
  } else if (q.type === "spelling_type") {
    card.appendChild(makePrompt(q.prompt, q.hint));
    const wrap = document.createElement("div");
    wrap.className = "type-input";
    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.placeholder = "영어로 쓰기";
    // 휴대폰 키보드의 자동 대문자·자동 고침이 답을 바꾸지 않도록
    input.setAttribute("autocapitalize", "none");
    input.setAttribute("autocorrect", "off");
    input.spellcheck = false;
    const submit = document.createElement("button");
    submit.className = "primary-btn";
    submit.textContent = "확인";
    const submitFn = () => handleAnswer(q, input.value, input);
    submit.addEventListener("click", submitFn);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submitFn();
    });
    wrap.appendChild(input);
    wrap.appendChild(submit);
    card.appendChild(wrap);
    setTimeout(() => input.focus(), 50);
  }

  fitToBox(card);
}

// 내용이 상자를 넘치면 --fit 비율을 조금씩 줄여서(글자·여백이 함께 작아짐) 상자 안에 맞춘다.
function fitToBox(box, minScale = 0.45) {
  let scale = 1;
  box.style.setProperty("--fit", "1");
  while (box.scrollHeight > box.clientHeight + 1 && scale > minScale) {
    scale -= 0.05;
    box.style.setProperty("--fit", scale.toFixed(2));
  }
}

function makePrompt(text, hint) {
  const prompt = document.createElement("div");
  prompt.className = "quiz-prompt";
  prompt.textContent = text;
  appendHint(prompt, hint);
  return prompt;
}

// many/much처럼 뜻이 같은 단어를 구분하는 힌트는 뜻 아래 작은 글씨로 붙인다.
function appendHint(prompt, hint) {
  if (!hint) return;
  const span = document.createElement("span");
  span.className = "quiz-hint";
  span.textContent = `(${hint})`;
  prompt.appendChild(span);
}

function makeOptionsGrid(options, onPick) {
  const grid = document.createElement("div");
  grid.className = "options-grid";
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.textContent = opt;
    btn.addEventListener("click", () => onPick(opt, btn));
    grid.appendChild(btn);
  });
  return grid;
}

function handleAnswer(question, value, sourceEl) {
  if (state.answered) return;

  // 뜻이 같은 다른 단어를 쓴 경우(much 문제에 many)는 채점하지 않고 다시 쓰게 한다.
  const sameMeaning = findSameMeaningWord(question, value, state.words);
  if (sameMeaning) {
    showSameMeaningNotice(sameMeaning, sourceEl);
    return;
  }
  state.answered = true;

  const correct = checkAnswer(question, value);

  if (!state.reviewMode) {
    const wordId = question.word.id;
    const type = question.type;
    const rec = state.progress[wordId] || {};
    const card = rec[type] || newCard();
    rec[type] = recordAnswer(card, correct);
    state.progress[wordId] = rec;
    store.saveProgress(state.user.id, state.progress);

    state.stats.totalAnswered = (state.stats.totalAnswered || 0) + 1;
    if (correct) state.stats.totalCorrect = (state.stats.totalCorrect || 0) + 1;

    const wrongToday = state.stats.wrongToday || [];
    const idx = wrongToday.findIndex((w) => w.wordId === wordId && w.type === type);
    if (correct) {
      if (idx !== -1) wrongToday.splice(idx, 1);
    } else if (idx === -1) {
      wrongToday.push({ wordId, type });
    }
    state.stats.wrongToday = wrongToday;

    recordDailyActivity(state.stats);
    store.saveStats(state.user.id, state.stats);
  }

  if (correct) {
    state.result.correct++;
  } else {
    state.result.wrong++;
    state.result.wrongWords.push(question.word);
  }

  if (question.type === "spelling_type") {
    sourceEl.classList.add(correct ? "correct" : "wrong");
    sourceEl.disabled = true;
  } else {
    const grid = sourceEl.parentElement;
    [...grid.children].forEach((btn) => {
      btn.disabled = true;
      if (btn.textContent === question.answer) btn.classList.add("correct");
      else if (btn === sourceEl) btn.classList.add("wrong");
    });
  }

  const feedback = el("quiz-feedback");
  feedback.classList.remove("correct", "wrong", "notice");
  feedback.classList.add(correct ? "correct" : "wrong");
  feedback.textContent = correct
    ? "정답이에요! 잘했어요 🎉"
    : `아쉬워요! 정답은 "${question.answer}" 예요`;
  fitToBox(feedback, 0.6);

  speak(question.word.en);
  el("btn-next").disabled = false;
}

function showSameMeaningNotice(word, input) {
  const feedback = el("quiz-feedback");
  feedback.classList.remove("correct", "wrong");
  feedback.classList.add("notice");
  feedback.textContent = `"${word.en}"도 뜻이 같지만 이 문제의 단어는 아니에요. 다른 단어를 써 볼까요?`;
  fitToBox(feedback, 0.6);
  input.focus();
  input.select();
}

// 날짜별로 푼 문제 수를 남긴다(통계의 학습 달력용). 1년 조금 넘게만 보관한다.
const DAILY_LOG_KEEP_DAYS = 400;

function recordDailyActivity(stats) {
  const today = store.todayStr();
  const log = stats.dailyLog && typeof stats.dailyLog === "object" ? stats.dailyLog : {};
  log[today] = (Number(log[today]) || 0) + 1;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DAILY_LOG_KEEP_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  Object.keys(log).forEach((day) => {
    if (day < cutoffStr) delete log[day];
  });
  stats.dailyLog = log;
  if (!stats.dailyLogStart) stats.dailyLogStart = today;
}

function nextQuestion() {
  state.index++;
  if (state.index >= state.session.length) {
    finishSession();
  } else {
    renderQuestion();
  }
}

function finishSession() {
  el("result-correct").textContent = state.result.correct;
  el("result-wrong").textContent = state.result.wrong;
  const list = el("result-wrong-list");
  list.innerHTML = "";
  state.result.wrongWords.forEach((w) => {
    const item = document.createElement("div");
    item.className = "result-wrong-item";
    const en = document.createElement("span");
    en.className = "en";
    en.textContent = w.en;
    const ko = document.createElement("span");
    ko.textContent = w.ko;
    item.append(en, ko);
    list.appendChild(item);
  });
  el("btn-review-wrong").classList.toggle("hidden", !(state.stats.wrongToday || []).length);

  const remaining = computeDueItems().length;
  const moreBtn = el("btn-more-review");
  moreBtn.classList.toggle("hidden", remaining === 0);
  moreBtn.textContent =
    remaining > MAX_SESSION_SIZE
      ? `📚 복습 ${MAX_SESSION_SIZE}개 더 하기 (남은 복습 ${remaining}개)`
      : `📚 남은 복습 ${remaining}개 더 하기`;

  showScreen("result");
}

// ---------- 우선 학습 단어 설정 ----------

// 한 줄에 한 단어. "단어 = 뜻" 또는 탭(엑셀에서 두 칸 복사)으로 구분하면 뜻도 함께 받는다.
function parseMyWordsText(text) {
  const entries = [];
  const invalid = [];
  const seen = new Set();
  text.split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    const sep = line.search(/[=\t]/);
    const en = (sep === -1 ? line : line.slice(0, sep)).trim().replace(/\s+/g, " ");
    const ko = sep === -1 ? "" : line.slice(sep + 1).trim();
    if (!WORD_PATTERN.test(en) || en.length > MAX_WORD_LENGTH) {
      invalid.push(line);
      return;
    }
    const id = en.toLowerCase();
    if (seen.has(id)) return;
    seen.add(id);
    entries.push({ id, en, ko });
  });
  return { entries, invalid };
}

// 확인 목록의 입력칸에 적은 뜻. 입력창을 고쳐서 목록이 다시 그려져도 유지된다.
let editorMeanings = new Map();

const meaningFor = (entry) => entry.ko || editorMeanings.get(entry.id) || "";

function openMyWordsEditor() {
  editorMeanings = new Map(state.myWords.custom.map((w) => [w.id, w.ko]));
  el("mywords-input").value = state.myWords.priority
    .map((id) => state.wordsById.get(id))
    .filter(Boolean)
    .map((w) => (BASE_WORDS_BY_ID.has(w.id) ? w.en : `${w.en} = ${w.ko}`))
    .join("\n");
  renderMyWordsPreview();
  showScreen("mywords");
}

function renderMyWordsPreview() {
  const { entries, invalid } = parseMyWordsText(el("mywords-input").value);
  const preview = el("mywords-preview");
  preview.innerHTML = "";

  const makeSpan = (className, text) => {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    return span;
  };

  invalid.forEach((line) => {
    const row = document.createElement("div");
    row.className = "mywords-row invalid";
    row.append(makeSpan("en", line), makeSpan("ko", "영어 단어로 읽을 수 없어요"));
    preview.appendChild(row);
  });

  entries.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "mywords-row";
    row.appendChild(makeSpan("en", entry.en));
    const base = BASE_WORDS_BY_ID.get(entry.id);
    if (base) {
      row.appendChild(makeSpan("ko", base.ko));
    } else if (entry.ko) {
      row.append(makeSpan("ko", entry.ko), makeSpan("tag-new", "새 단어"));
    } else {
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "뜻을 입력하세요";
      input.maxLength = 40;
      input.value = editorMeanings.get(entry.id) || "";
      input.addEventListener("input", () => {
        editorMeanings.set(entry.id, input.value.trim());
        updateMyWordsSummary();
      });
      row.append(input, makeSpan("tag-new", "새 단어"));
    }
    preview.appendChild(row);
  });

  updateMyWordsSummary();
}

function updateMyWordsSummary() {
  const { entries, invalid } = parseMyWordsText(el("mywords-input").value);
  const custom = entries.filter((e) => !BASE_WORDS_BY_ID.has(e.id));
  const missing = custom.filter((e) => !meaningFor(e)).length;

  const summary = el("mywords-summary");
  summary.textContent = `총 ${entries.length}개 · 목록에 있는 단어 ${entries.length - custom.length}개 · 새로 추가할 단어 ${custom.length}개`;
  const problems = [];
  if (invalid.length) problems.push(`고쳐야 할 줄 ${invalid.length}개`);
  if (missing) problems.push(`뜻이 필요한 단어 ${missing}개`);
  if (problems.length) {
    const warn = document.createElement("span");
    warn.className = "warn";
    warn.textContent = ` · ${problems.join(" · ")}`;
    summary.appendChild(warn);
  }
  el("btn-mywords-save").disabled = invalid.length > 0 || missing > 0;
}

function saveMyWordsFromEditor() {
  const { entries, invalid } = parseMyWordsText(el("mywords-input").value);
  if (invalid.length) return;
  const priority = entries.map((e) => e.id);
  const inList = new Set(priority);
  // 목록에서 빠진 추가 단어라도 이미 공부를 시작했으면 계속 복습되도록 남기고,
  // 한 번도 안 푼 것(오타로 넣었다 지운 단어 등)은 버린다.
  const custom = new Map(
    state.myWords.custom.filter((w) => inList.has(w.id) || state.progress[w.id]).map((w) => [w.id, w])
  );
  for (const entry of entries) {
    if (BASE_WORDS_BY_ID.has(entry.id)) continue;
    const ko = meaningFor(entry);
    if (!ko) return;
    custom.set(entry.id, makeCustomWord(entry.en, ko));
  }
  store.saveMyWords(state.user.id, { priority, custom: [...custom.values()] });
  loadUserWords();
  renderDashboard();
  showScreen("dashboard");
}

// ---------- 기록 내보내기 / 가져오기 ----------

function exportRecords() {
  const data = store.exportAll();
  if (!data.users.length) {
    alert("내보낼 기록이 없어요.");
    return;
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `영단어-기록-${store.todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importRecords(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    alert("파일을 읽을 수 없어요. 이 앱에서 내보낸 .json 파일인지 확인해 주세요.");
    return;
  }
  const names = Array.isArray(data?.users) ? data.users.map((u) => u?.name).filter(Boolean).join(", ") : "";
  if (!confirm(`다음 사용자의 기록을 가져올게요: ${names || "(없음)"}\n\n같은 사용자가 이미 있으면 파일의 기록으로 바뀌어요. 계속할까요?`)) {
    return;
  }
  try {
    const count = store.importAll(data);
    renderUserList();
    alert(`${count}명의 기록을 가져왔어요.`);
  } catch (e) {
    alert(e.message);
  }
}

// ---------- 이벤트 바인딩 ----------

function renderHelpDetails() {
  el("help-word-count").textContent = BASE_WORDS.length;
  const rows = el("help-level-rows");
  rows.innerHTML = "";
  INTERVAL_DAYS.forEach((days, level) => {
    const tr = document.createElement("tr");
    const lv = document.createElement("td");
    lv.textContent = level;
    const next = document.createElement("td");
    next.textContent = days === 1 ? "다음 날" : `${days}일 후`;
    tr.append(lv, next);
    rows.appendChild(tr);
  });
}

function init() {
  store.migrateSchemaIfNeeded();
  renderHelpDetails();
  renderUserList();
  showScreen("users");

  el("btn-home").addEventListener("click", goHome);
  el("btn-help").addEventListener("click", openHelp);
  el("btn-back-from-help").addEventListener("click", () => showScreen(state.screenBeforeHelp));
  el("btn-delete-user").addEventListener("click", deleteCurrentUser);

  // 휴대폰을 돌리거나 창 크기가 바뀌면 문제 카드 글자 크기를 다시 맞춘다.
  window.addEventListener("resize", () => {
    if (state.screen !== "quiz") return;
    fitToBox(el("quiz-card"));
    if (el("quiz-feedback").textContent) fitToBox(el("quiz-feedback"), 0.6);
  });

  el("btn-add-user").addEventListener("click", () => {
    state.selectedEmoji = EMOJIS[0];
    renderEmojiPicker();
    el("add-user-form").classList.remove("hidden");
    el("new-user-name").value = "";
    el("new-user-name").focus();
  });

  el("btn-cancel-add").addEventListener("click", () => {
    el("add-user-form").classList.add("hidden");
  });

  const confirmAdd = () => {
    const name = el("new-user-name").value.trim();
    if (!name) {
      el("new-user-name").focus();
      return;
    }
    const user = store.addUser(name, state.selectedEmoji);
    el("add-user-form").classList.add("hidden");
    renderUserList();
    selectUser(user.id);
  };
  el("btn-confirm-add").addEventListener("click", confirmAdd);
  el("new-user-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirmAdd();
  });

  el("btn-switch-user").addEventListener("click", () => {
    renderUserList();
    showScreen("users");
  });

  el("btn-export").addEventListener("click", exportRecords);
  el("btn-import").addEventListener("click", () => el("import-file").click());
  el("import-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) importRecords(file);
  });

  el("btn-start-study").addEventListener("click", () => startSession("study"));
  el("btn-free-practice").addEventListener("click", () => startSession("free"));
  el("btn-more-review").addEventListener("click", () => startSession("review"));
  el("btn-next").addEventListener("click", nextQuestion);

  el("btn-mywords").addEventListener("click", openMyWordsEditor);
  el("mywords-input").addEventListener("input", renderMyWordsPreview);
  el("btn-mywords-cancel").addEventListener("click", () => showScreen("dashboard"));
  el("btn-mywords-save").addEventListener("click", saveMyWordsFromEditor);
  el("btn-review-wrong").addEventListener("click", startWrongReview);
  el("btn-back-dashboard").addEventListener("click", () => {
    state.reviewMode = false;
    renderDashboard();
    showScreen("dashboard");
  });

  el("btn-view-stats").addEventListener("click", () => {
    renderStats();
    showScreen("stats");
  });
  el("btn-back-from-stats").addEventListener("click", () => {
    renderDashboard();
    showScreen("dashboard");
  });
}

init();
