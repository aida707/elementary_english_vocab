window.VocabApp = window.VocabApp || {};

(function () {
  const QUESTION_TYPES = ["meaning_choice", "word_choice", "spelling_choice", "spelling_type"];

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // "많은, 다수의" → ["많은", "다수의"]. 뜻을 쉼표로 나눈 조각 하나라도 같으면 뜻이 겹치는 단어로 본다.
  // "~을 닫다"와 "닫다"는 같은 뜻이므로 앞의 "~을/~를"은 떼고 비교한다.
  const meaningPartsCache = new Map();
  function meaningParts(ko) {
    if (!meaningPartsCache.has(ko)) {
      const parts = ko.split(",").map((p) => p.replace(/^\s*~[을를]\s*/, "").replace(/\s+/g, " ").trim());
      meaningPartsCache.set(ko, parts.filter(Boolean));
    }
    return meaningPartsCache.get(ko);
  }

  function sharesMeaning(a, b) {
    if (a.id === b.id) return false;
    const parts = new Set(meaningParts(a.ko));
    return meaningParts(b.ko).some((p) => parts.has(p));
  }

  // 오답 보기에는 정답과 뜻이 겹치는 단어를 넣지 않는다("많은"에 much와 many가 함께 나오지 않게).
  function sampleDistractors(pool, exclude, key, count) {
    const seen = new Set([exclude[key]]);
    const candidates = shuffle(pool).filter((w) => {
      if (seen.has(w[key]) || sharesMeaning(exclude, w)) return false;
      seen.add(w[key]);
      return true;
    });
    return candidates.slice(0, count);
  }

  const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

  function buildMeaningChoice(word, pool) {
    const distractors = sampleDistractors(pool, word, "ko", 3);
    const options = shuffle([word, ...distractors].map((w) => w.ko));
    return { type: "meaning_choice", word, prompt: word.en, options, answer: word.ko };
  }

  function buildWordChoice(word, pool) {
    const distractors = sampleDistractors(pool, word, "en", 3);
    const options = shuffle([word, ...distractors].map((w) => w.en));
    return { type: "word_choice", word, prompt: word.ko, hint: word.hint, options, answer: word.en };
  }

  function buildSpellingChoice(word) {
    const en = word.en;
    const letterIdxs = [...en].map((c, i) => (/[a-z]/i.test(c) ? i : -1)).filter((i) => i >= 0);
    const blankIdx = letterIdxs[Math.floor(Math.random() * letterIdxs.length)];
    const correctLetter = en[blankIdx].toLowerCase();
    const masked = en.slice(0, blankIdx) + "_" + en.slice(blankIdx + 1);
    const others = shuffle(ALPHABET.split("").filter((c) => c !== correctLetter)).slice(0, 3);
    const options = shuffle([correctLetter, ...others]);
    return { type: "spelling_choice", word, prompt: word.ko, hint: word.hint, masked, options, answer: correctLetter };
  }

  function buildSpellingType(word) {
    return { type: "spelling_type", word, prompt: word.ko, hint: word.hint, answer: word.en.toLowerCase() };
  }

  function buildQuestion(word, pool, forceType) {
    const type = forceType || QUESTION_TYPES[Math.floor(Math.random() * QUESTION_TYPES.length)];
    if (type === "meaning_choice") return buildMeaningChoice(word, pool);
    if (type === "word_choice") return buildWordChoice(word, pool);
    if (type === "spelling_choice") return buildSpellingChoice(word);
    return buildSpellingType(word);
  }

  function checkAnswer(question, userAnswer) {
    if (question.type === "spelling_type") {
      return String(userAnswer || "").trim().toLowerCase() === question.answer;
    }
    return userAnswer === question.answer;
  }

  // 쓰기 문제에서 정답은 아니지만 뜻이 같은 다른 단어(much 자리에 many 등)를 썼으면 그 단어를 돌려준다.
  // 학습 단어 목록뿐 아니라, 문제로는 나오지 않는 인정 단어 목록(huge 등)에서도 찾는다.
  // 이런 답은 틀림으로 치지 않고 다시 쓰게 한다.
  function findSameMeaningWord(question, userAnswer, pool) {
    if (question.type !== "spelling_type") return null;
    const typed = String(userAnswer || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!typed || typed === question.answer) return null;
    const candidates = [...pool, ...(window.VocabApp.ACCEPTED_WORDS || [])].filter((w) => w.id === typed);
    return candidates.find((w) => sharesMeaning(question.word, w)) || null;
  }

  // 한국어로 설정된 휴대폰은 lang만 "en-US"로 주면 무시하고 기본 한국어 목소리로 읽는 경우가 많아서
  // (tie → "티에"), 기기에 있는 영어 목소리를 직접 골라 쓴다. 목소리 목록은 늦게 채워질 수 있다.
  let englishVoice = null;

  function pickEnglishVoice() {
    const voices = window.speechSynthesis.getVoices();
    const english = voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
    const us = english.filter((v) => /^en[-_]US/i.test(v.lang));
    englishVoice =
      us.find((v) => v.localService) ||
      us[0] ||
      english.find((v) => /^en[-_]GB/i.test(v.lang)) ||
      english[0] ||
      null;
  }

  if ("speechSynthesis" in window) {
    pickEnglishVoice();
    window.speechSynthesis.addEventListener("voiceschanged", pickEnglishVoice);
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    if (!englishVoice) pickEnglishVoice();
    const utter = new SpeechSynthesisUtterance(text);
    if (englishVoice) utter.voice = englishVoice;
    utter.lang = englishVoice ? englishVoice.lang : "en-US";
    utter.rate = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }

  window.VocabApp.quiz = { shuffle, buildQuestion, checkAnswer, findSameMeaningWord, speak, QUESTION_TYPES };
})();
