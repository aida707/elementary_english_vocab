window.VocabApp = window.VocabApp || {};

(function () {
  const todayStr = window.VocabApp.store.todayStr;

  // 간격 반복(spaced repetition) 스케줄. 1일부터 시작해 맞출 때마다 점점 넓어지고,
  // 120일에서 상한을 두어 완전히 익힌 단어도 주기적으로 다시 등장한다.
  const INTERVAL_DAYS = [1, 2, 4, 7, 15, 30, 60, 120];
  const MAX_LEVEL = INTERVAL_DAYS.length - 1;

  // "2026-10-06"을 그 지역의 날짜로 읽는다(new Date("2026-10-06")은 UTC 기준이라 요일이 어긋날 수 있다).
  function parseDay(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(dateStr, days) {
    const d = dateStr ? parseDay(dateStr) : new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  const isWeekend = (dateStr) => [0, 6].includes(parseDay(dateStr).getDay());

  // 주말에는 복습이 돌아오지 않는다. 토요일은 금요일로 당기고, 일요일은 월요일로 미룬다.
  // 금요일로 당기면 마지막으로 푼 날 이전이 되는 경우(금요일에 푼 문제의 "1일 후" 등)는 월요일로 미룬다.
  function moveOffWeekend(dateStr, studiedOn) {
    const day = parseDay(dateStr).getDay();
    if (day === 6) {
      const friday = addDays(dateStr, -1);
      return studiedOn && friday <= studiedOn ? addDays(dateStr, 2) : friday;
    }
    if (day === 0) return addDays(dateStr, 1);
    return dateStr;
  }

  // 실제로 복습할 날. 주말 규칙이 생기기 전에 토/일로 잡힌 카드도 여기서 평일로 옮겨진다.
  function dueDate(card) {
    return card.next ? moveOffWeekend(card.next, card.lastSeen) : null;
  }

  function newCard() {
    return { level: 0, next: todayStr(), correct: 0, wrong: 0, lastSeen: null, seen: 0 };
  }

  function recordAnswer(card, isCorrect) {
    const today = todayStr();
    const isFirstAttempt = (card.seen || 0) === 0;
    const updated = { ...card, lastSeen: today, seen: (card.seen || 0) + 1 };
    if (isCorrect) {
      updated.correct = (card.correct || 0) + 1;
      // 처음 보고 맞히면 레벨 2(4일 후)로 바로 올라가고, 이미 본 적 있는 복습 문제는
      // 평소처럼 한 레벨씩 올라간다.
      updated.level = isFirstAttempt ? 2 : Math.min((card.level || 0) + 1, MAX_LEVEL);
      updated.next = moveOffWeekend(addDays(today, INTERVAL_DAYS[updated.level]), today);
    } else {
      updated.wrong = (card.wrong || 0) + 1;
      // 처음 보고 틀리면 레벨 0(1일 후). 복습 중에 틀리면 완전히 리셋하지 않고 한 레벨만
      // 낮추고, 다음 복습도 그 낮아진 레벨의 간격을 따른다. (당일 오답은 "오늘 틀린 문제
      // 복습하기"로 바로 다시 볼 수 있으므로 무조건 "내일" 강제하지 않는다.)
      updated.level = isFirstAttempt ? 0 : Math.max((card.level || 0) - 1, 0);
      updated.next = moveOffWeekend(addDays(today, INTERVAL_DAYS[updated.level]), today);
    }
    return updated;
  }

  function isDue(card) {
    const due = dueDate(card);
    return !due || due <= todayStr();
  }

  function isMastered(card) {
    return card.level >= MAX_LEVEL;
  }

  window.VocabApp.srs = { INTERVAL_DAYS, MAX_LEVEL, newCard, recordAnswer, isDue, dueDate, isWeekend, isMastered };
})();
