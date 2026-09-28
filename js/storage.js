window.VocabApp = window.VocabApp || {};

(function () {
  const USERS_KEY = "vocab_app_users";
  const SCHEMA_VERSION_KEY = "vocab_app_schema_version";
  const CURRENT_SCHEMA_VERSION = 2; // v2: progress is tracked per (word, question type)

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getUsers() {
    return readJSON(USERS_KEY, []);
  }

  function addUser(name, avatar) {
    const users = getUsers();
    const user = { id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, name, avatar, createdAt: todayStr() };
    users.push(user);
    writeJSON(USERS_KEY, users);
    return user;
  }

  function deleteUser(userId) {
    const users = getUsers().filter((u) => u.id !== userId);
    writeJSON(USERS_KEY, users);
    localStorage.removeItem(`vocab_app_progress_${userId}`);
    localStorage.removeItem(`vocab_app_stats_${userId}`);
    localStorage.removeItem(`vocab_app_mywords_${userId}`);
  }

  function getProgress(userId) {
    return readJSON(`vocab_app_progress_${userId}`, {});
  }

  function saveProgress(userId, progress) {
    writeJSON(`vocab_app_progress_${userId}`, progress);
  }

  // 사용자별 우선 학습 단어(priority: 단어 id 목록)와, 기본 단어 목록에 없어서
  // 사용자가 뜻을 직접 입력한 단어(custom: {id, en, ko, cat})
  function getMyWords(userId) {
    const data = readJSON(`vocab_app_mywords_${userId}`, null);
    return {
      priority: Array.isArray(data?.priority) ? data.priority : [],
      custom: Array.isArray(data?.custom) ? data.custom : [],
    };
  }

  function saveMyWords(userId, data) {
    writeJSON(`vocab_app_mywords_${userId}`, data);
  }

  function getStats(userId) {
    const stats = readJSON(`vocab_app_stats_${userId}`, {
      streak: 0,
      longestStreak: 0,
      lastStudyDate: null,
      totalAnswered: 0,
      totalCorrect: 0,
      newWordsToday: 0,
      newWordsDate: null,
      wrongToday: [],
      wrongTodayDate: null,
      dailyLog: {},
      dailyLogStart: null,
    });
    if (stats.newWordsDate !== todayStr()) {
      stats.newWordsToday = 0;
      stats.newWordsDate = todayStr();
    }
    if (stats.wrongTodayDate !== todayStr()) {
      stats.wrongToday = [];
      stats.wrongTodayDate = todayStr();
    }
    return stats;
  }

  function saveStats(userId, stats) {
    writeJSON(`vocab_app_stats_${userId}`, stats);
  }

  function recordStudyDay(stats) {
    const today = todayStr();
    if (stats.lastStudyDate === today) return stats;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    stats.streak = stats.lastStudyDate === yStr ? stats.streak + 1 : 1;
    stats.longestStreak = Math.max(stats.longestStreak || 0, stats.streak);
    stats.lastStudyDate = today;
    return stats;
  }

  function migrateSchemaIfNeeded() {
    const stored = readJSON(SCHEMA_VERSION_KEY, 0);
    if (stored === CURRENT_SCHEMA_VERSION) return;
    getUsers().forEach((u) => {
      localStorage.removeItem(`vocab_app_progress_${u.id}`);
      localStorage.removeItem(`vocab_app_stats_${u.id}`);
      localStorage.removeItem(`vocab_app_mywords_${u.id}`);
    });
    writeJSON(SCHEMA_VERSION_KEY, CURRENT_SCHEMA_VERSION);
  }

  const EXPORT_APP_ID = "elementary-english-vocab";

  function exportAll() {
    return {
      app: EXPORT_APP_ID,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      users: getUsers().map((u) => ({
        ...u,
        progress: readJSON(`vocab_app_progress_${u.id}`, {}),
        stats: readJSON(`vocab_app_stats_${u.id}`, null),
        myWords: readJSON(`vocab_app_mywords_${u.id}`, null),
      })),
    };
  }

  const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

  const isValidMyWords = (m) =>
    isPlainObject(m) &&
    Array.isArray(m.priority) &&
    m.priority.every((id) => typeof id === "string") &&
    Array.isArray(m.custom) &&
    m.custom.every(
      (w) => isPlainObject(w) && typeof w.id === "string" && typeof w.en === "string" && typeof w.ko === "string"
    );

  // 파일에 담긴 사용자만 추가/덮어쓰고, 파일에 없는 기존 사용자는 그대로 둔다.
  // 쓰기 전에 전체를 먼저 검증해서, 잘못된 파일이면 아무것도 바꾸지 않는다.
  function importAll(data) {
    if (!isPlainObject(data) || data.app !== EXPORT_APP_ID || !Array.isArray(data.users)) {
      throw new Error("이 앱에서 내보낸 기록 파일이 아니에요.");
    }
    if (data.schemaVersion !== CURRENT_SCHEMA_VERSION) {
      throw new Error("지원하지 않는 버전의 기록 파일이에요.");
    }
    const valid = data.users.every(
      (u) =>
        isPlainObject(u) &&
        typeof u.id === "string" && u.id &&
        typeof u.name === "string" &&
        (u.progress === undefined || isPlainObject(u.progress)) &&
        (u.stats === undefined || u.stats === null || isPlainObject(u.stats)) &&
        (u.myWords === undefined || u.myWords === null || isValidMyWords(u.myWords))
    );
    if (!valid) throw new Error("기록 파일 내용이 손상되었어요.");

    const users = getUsers();
    data.users.forEach((u) => {
      const entry = { id: u.id, name: u.name, avatar: u.avatar, createdAt: u.createdAt };
      const idx = users.findIndex((x) => x.id === u.id);
      if (idx === -1) users.push(entry);
      else users[idx] = entry;
      writeJSON(`vocab_app_progress_${u.id}`, u.progress || {});
      if (u.stats) writeJSON(`vocab_app_stats_${u.id}`, u.stats);
      else localStorage.removeItem(`vocab_app_stats_${u.id}`);
      // 우선 단어 설정이 없던 예전 내보내기 파일(undefined)이면 기존 설정을 그대로 둔다.
      if (u.myWords) writeJSON(`vocab_app_mywords_${u.id}`, u.myWords);
      else if (u.myWords === null) localStorage.removeItem(`vocab_app_mywords_${u.id}`);
    });
    writeJSON(USERS_KEY, users);
    return data.users.length;
  }

  window.VocabApp.store = {
    exportAll,
    importAll,
    todayStr,
    getUsers,
    addUser,
    deleteUser,
    getProgress,
    saveProgress,
    getMyWords,
    saveMyWords,
    getStats,
    saveStats,
    recordStudyDay,
    migrateSchemaIfNeeded,
  };
})();
