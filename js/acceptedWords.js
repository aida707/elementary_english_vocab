window.VocabApp = window.VocabApp || {};

// 인정 단어: 문제로는 나오지 않지만, 쓰기 문제에서 이 단어를 쓰면 틀림으로 치지 않고
// 다시 쓸 기회를 준다(예: "큰" 문제에 huge). 중·고등·성인 수준의 동의어를 모아 둔다.
// 뜻은 학습 단어의 뜻 조각과 똑같이 적어야 연결된다("큰, 거대한"이면 "큰"과 "거대한" 둘 다).
// 학습 단어 목록에 이미 있는 단어는 여기 넣지 않는다.
window.VocabApp.ACCEPTED_WORDS = [
  // 큰 · 거대한 (big, large, great)
  ["giant", "거대한"],
  ["enormous", "거대한"],
  // 빠른 (fast, quick)
  ["rapid", "빠른"],
  ["swift", "빠른"],
  ["speedy", "빠른"],
  // 예쁜 · 아름다운 · 귀여운 (beautiful, pretty, cute)
  ["lovely", "예쁜, 아름다운"],
  ["gorgeous", "아름다운"],
  ["adorable", "귀여운"],
  // 좋은 · 멋진 · 훌륭한 (good, nice, fine)
  ["wonderful", "멋진, 훌륭한"],
  ["awesome", "멋진"],
  // 기쁜 · 즐거운 (glad)
  ["joyful", "기쁜, 즐거운"],
  ["pleased", "기쁜"],
  ["delighted", "기쁜"],
  // 화난 (angry)
  ["furious", "화난, 성난"],
  // 피곤한 · 지친 (tired)
  ["exhausted", "지친, 피곤한"],
  ["weary", "지친, 피곤한"],
  // 무서워하여 (afraid)
  ["scared", "무서워하여, 두려워하여"],
  // 조용한 · 고요한 (quiet)
  ["silent", "조용한"],
  ["calm", "고요한"],
  // 돈 많은 (rich)
  ["wealthy", "돈 많은, 부자의"],
  // 강한 · 힘센 (strong)
  ["powerful", "강한, 힘센"],
  // 진짜의 (real)
  ["genuine", "진짜의"],
  // 아주 · 대단히 (very)
  ["extremely", "아주, 대단히"],
  // 살찐 (fat)
  ["overweight", "살찐"],
  // 시작하다 (begin, start)
  ["commence", "시작하다"],
  // 사다 (buy)
  ["purchase", "사다"],
  // 고치다 (fix)
  ["repair", "고치다"],
  ["mend", "고치다"],
  // 떠나다 (leave, start)
  ["depart", "떠나다"],
  // 서두르다 (hurry)
  ["rush", "서두르다"],
  // 대답하다 (answer)
  ["reply", "대답, 대답하다"],
  ["respond", "대답하다"],
  // 외치다 · 소리치다 (shout, cry)
  ["yell", "외치다, 소리치다"],
  ["scream", "소리치다"],
  // 이야기하다 (talk, tell)
  ["chat", "이야기하다"],
  // 바라보다 · 지켜보다 (look, watch)
  ["gaze", "바라보다"],
  ["stare", "바라보다"],
  ["observe", "지켜보다"],
  // 웃다 · 미소 (laugh, smile)
  ["giggle", "웃다"],
  ["chuckle", "웃다"],
  ["grin", "미소"],
  // 원하다 (want)
  ["desire", "원하다"],
  // 냄새 (smell)
  ["scent", "냄새"],
  ["odor", "냄새"],
  // 사진 (picture)
  ["photograph", "사진"],
  // 시험 (test)
  ["exam", "시험"],
  ["examination", "시험"],
  // 선물 (present)
  ["gift", "선물"],
  // 직업 (job)
  ["occupation", "직업"],
  // 자동차 (car)
  ["automobile", "자동차"],
  // 비행기 (airplane, plane)
  ["aircraft", "비행기"],
  // 택시 (taxi)
  ["cab", "택시"],
  // 길 · 거리 (road, street, way)
  ["path", "길"],
  ["lane", "길"],
  ["avenue", "거리"],
  // 작은 돌 (rock)
  ["pebble", "작은 돌"],
  // 바지 (pants)
  ["trousers", "바지"],
  // 엄마 · 아빠 (mom, dad)
  ["mommy", "엄마"],
  ["mum", "엄마"],
  ["daddy", "아빠"],
].map(([en, ko]) => ({ id: en.toLowerCase(), en, ko }));
