window.VocabApp = window.VocabApp || {};

// 통계 화면의 차트들. 모든 차트는 한 가지 색(파랑) 또는 파랑의 밝기 단계만 쓰고,
// 값은 툴팁(마우스 올리기/손가락으로 누르기)과 "숫자로 보기" 표로도 확인할 수 있다.
(function () {
  const DAY_MS = 86400000;
  const toDayNum = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d) / DAY_MS;
  };
  const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
  const formatDay = (n) => {
    const d = new Date(n * DAY_MS);
    return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
  };
  const isDateKey = (k) => /^\d{4}-\d{2}-\d{2}$/.test(k);

  const TYPE_SHORT = {
    meaning_choice: "뜻 고르기",
    word_choice: "단어 고르기",
    spelling_choice: "빈칸 철자",
    spelling_type: "직접 쓰기",
  };

  function h(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // ---------- 툴팁 (마우스 올리기, 키보드 포커스, 손가락 탭 모두 지원) ----------

  let tooltip = null;
  function ensureTooltip() {
    if (tooltip) return;
    tooltip = h("div", "viz-tooltip");
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
    const show = (target) => {
      tooltip.textContent = target.dataset.tip;
      tooltip.hidden = false;
      const r = target.getBoundingClientRect();
      const tw = tooltip.offsetWidth;
      const left = Math.min(Math.max(8, r.left + r.width / 2 - tw / 2), window.innerWidth - tw - 8);
      const above = r.top - tooltip.offsetHeight - 8;
      tooltip.style.left = `${left + window.scrollX}px`;
      tooltip.style.top = `${(above > 8 ? above : r.bottom + 8) + window.scrollY}px`;
    };
    const hide = () => { tooltip.hidden = true; };
    document.addEventListener("pointerover", (e) => {
      const t = e.target.closest("[data-tip]");
      if (t && e.pointerType === "mouse") show(t);
    });
    document.addEventListener("pointerout", (e) => {
      if (e.pointerType === "mouse" && e.target.closest("[data-tip]")) hide();
    });
    document.addEventListener("pointerdown", (e) => {
      const t = e.target.closest("[data-tip]");
      if (t && e.pointerType !== "mouse") show(t);
      else if (!t) hide();
    });
    document.addEventListener("focusin", (e) => {
      const t = e.target.closest("[data-tip]");
      if (t) show(t);
    });
    document.addEventListener("focusout", hide);
    window.addEventListener("scroll", hide, { passive: true });
  }

  function tip(node, text) {
    node.dataset.tip = text;
    node.tabIndex = 0;
    node.setAttribute("aria-label", text);
    return node;
  }

  function tableView(headers, rows) {
    const details = h("details", "viz-table-view");
    details.appendChild(h("summary", "", "숫자로 보기"));
    const table = h("table", "viz-table");
    const thead = h("thead");
    const tr = h("tr");
    headers.forEach((x) => tr.appendChild(h("th", "", x)));
    thead.appendChild(tr);
    table.appendChild(thead);
    const tbody = h("tbody");
    rows.forEach((row) => {
      const r = h("tr");
      row.forEach((x) => r.appendChild(h("td", "", String(x))));
      tbody.appendChild(r);
    });
    table.appendChild(tbody);
    details.appendChild(table);
    return details;
  }

  function statTiles(items) {
    const grid = h("div", "viz-tiles");
    items.forEach(([label, value]) => {
      const tile = h("div", "viz-tile");
      tile.append(h("div", "viz-tile-value", value), h("div", "viz-tile-label", label));
      grid.appendChild(tile);
    });
    return grid;
  }

  function meter(label, value, total) {
    const row = h("div", "viz-meter-row");
    const top = h("div", "viz-meter-top");
    top.append(h("span", "", label), h("span", "viz-meter-value", `${value} / ${total}`));
    const track = h("div", "viz-meter-track");
    const fill = h("div", "viz-meter-fill");
    fill.style.width = total ? `${(value / total) * 100}%` : "0%";
    track.appendChild(fill);
    row.append(top, track);
    return row;
  }

  // ---------- 1. 학습 기록 (공부한 날 + 12주 달력) ----------

  const CAL_WEEKS = 12;
  const CAL_BINS = [
    { min: 1, label: "1~9", cls: "cal-1" },
    { min: 10, label: "10~19", cls: "cal-2" },
    { min: 20, label: "20~29", cls: "cal-3" },
    { min: 30, label: "30+", cls: "cal-4" },
  ];
  const binFor = (count) => [...CAL_BINS].reverse().find((b) => count >= b.min);

  function renderStudyDays(box, stats, today) {
    box.innerHTML = "";
    const log = {};
    Object.entries(stats.dailyLog || {}).forEach(([k, v]) => {
      const n = Number(v);
      if (isDateKey(k) && n > 0) log[toDayNum(k)] = n;
    });
    const daysIn = (span) => Object.keys(log).filter((d) => d > today - span && d <= today).length;
    const solvedIn = (span) =>
      Object.entries(log).reduce((sum, [d, n]) => (d > today - span && d <= today ? sum + n : sum), 0);

    box.appendChild(
      statTiles([
        ["최근 30일 중 공부한 날", `${daysIn(30)}일`],
        ["최근 1년 중 공부한 날", `${daysIn(365)}일`],
        ["최근 30일 푼 문제", `${solvedIn(30)}개`],
      ])
    );

    // 이번 주 일요일까지 보이도록, 월요일 시작 12주 격자
    const weekday = (new Date(today * DAY_MS).getUTCDay() + 6) % 7; // 월=0 … 일=6
    const start = today - weekday - (CAL_WEEKS - 1) * 7;
    const cal = h("div", "viz-cal");
    const dayLabels = h("div", "viz-cal-daylabels");
    ["월", "", "수", "", "금", "", "일"].forEach((x) => dayLabels.appendChild(h("span", "", x)));
    const grid = h("div", "viz-cal-grid");
    grid.setAttribute("role", "img");
    grid.setAttribute("aria-label", `최근 ${CAL_WEEKS}주 학습 달력`);
    const rows = [];
    for (let w = 0; w < CAL_WEEKS; w++) {
      const col = h("div", "viz-cal-week");
      for (let d = 0; d < 7; d++) {
        const day = start + w * 7 + d;
        const cell = h("div", "viz-cal-cell");
        if (day > today) {
          cell.classList.add("future");
        } else {
          const count = log[day] || 0;
          const bin = binFor(count);
          if (bin) cell.classList.add(bin.cls);
          if (day === today) cell.classList.add("today");
          tip(cell, `${formatDay(day)} · ${count ? `${count}문제` : "공부 안 함"}`);
          if (count) rows.push([formatDay(day), `${count}문제`]);
        }
        col.appendChild(cell);
      }
      grid.appendChild(col);
    }
    cal.append(dayLabels, grid);
    box.appendChild(cal);

    const legend = h("div", "viz-cal-legend");
    legend.appendChild(h("span", "", "푼 문제"));
    [{ cls: "", label: "0" }, ...CAL_BINS].forEach((b) => {
      const item = h("span", "viz-cal-legend-item");
      const sw = h("span", `viz-cal-cell ${b.cls}`);
      sw.setAttribute("aria-hidden", "true");
      item.append(sw, h("span", "", b.label));
      legend.appendChild(item);
    });
    box.appendChild(legend);

    if (stats.dailyLogStart) {
      box.appendChild(h("p", "viz-note", `학습 날짜는 ${stats.dailyLogStart}부터 기록돼요.`));
    } else {
      box.appendChild(h("p", "viz-note", "문제를 풀면 오늘부터 학습 날짜가 기록돼요."));
    }
    if (rows.length) box.appendChild(tableView(["날짜", "푼 문제"], rows.reverse()));
  }

  // ---------- 2. 앞으로의 복습 일정 ----------

  const FORECAST_DAYS = 14;
  const niceMax = (v) => {
    if (v <= 5) return 5;
    const step = v <= 20 ? 5 : v <= 50 ? 10 : v <= 100 ? 20 : 50;
    return Math.ceil(v / step) * step;
  };

  function renderForecast(box, cards, today, dailyCap) {
    box.innerHTML = "";
    const daily = new Array(FORECAST_DAYS + 1).fill(0);
    let mid = 0;
    let far = 0;
    cards.forEach((card) => {
      const d = card.next ? toDayNum(card.next) - today : 0;
      if (d <= 0) daily[0]++;
      else if (d <= FORECAST_DAYS) daily[d]++;
      else if (d <= 29) mid++;
      else far++;
    });

    const max = Math.max(...daily);
    const scaleMax = niceMax(max);
    const plotH = 120;
    const chart = h("div", "viz-cols");
    const plot = h("div", "viz-cols-plot");
    plot.style.height = `${plotH}px`;
    const topGrid = h("div", "viz-grid-line");
    topGrid.style.bottom = `${plotH}px`;
    topGrid.appendChild(h("span", "viz-grid-label", String(scaleMax)));
    plot.appendChild(topGrid);
    if (scaleMax >= dailyCap) {
      const cap = h("div", "viz-ref-line");
      cap.style.bottom = `${(dailyCap / scaleMax) * plotH}px`;
      cap.appendChild(h("span", "viz-ref-label", `하루 최대 ${dailyCap}문제`));
      plot.appendChild(cap);
    }

    const peak = daily.indexOf(max);
    daily.forEach((v, d) => {
      const slot = h("div", "viz-col-slot");
      const when = d === 0 ? "오늘 (밀린 복습 포함)" : `${d}일 후 · ${formatDay(today + d)}`;
      tip(slot, `${when} · ${v}문제`);
      const bar = h("div", "viz-col-bar");
      bar.style.height = v ? `${Math.max(3, (v / scaleMax) * plotH)}px` : "0";
      if (v && (d === 0 || d === peak)) {
        const label = h("span", "viz-col-label", String(v));
        bar.appendChild(label);
      }
      slot.appendChild(bar);
      plot.appendChild(slot);
    });
    chart.appendChild(plot);

    const axis = h("div", "viz-cols-axis");
    daily.forEach((_, d) => {
      const text = d === 0 ? "오늘" : d === 7 || d === FORECAST_DAYS ? String(d) : "";
      axis.appendChild(h("span", "", text));
    });
    chart.appendChild(axis);
    chart.appendChild(h("div", "viz-axis-caption", "며칠 후"));
    box.appendChild(chart);

    box.appendChild(
      statTiles([
        ["15~29일 후", `${mid}문제`],
        ["30일 이상 뒤", `${far}문제`],
      ])
    );
    box.appendChild(
      tableView(
        ["언제", "문제 수"],
        [
          ...daily.map((v, d) => [d === 0 ? "오늘 (밀린 것 포함)" : `${d}일 후`, v]),
          ["15~29일 후", mid],
          ["30일 이상 뒤", far],
        ]
      )
    );
  }

  // ---------- 3. 유형별 레벨 분포 (표 + 밝기) ----------

  const LEVEL_STEPS = ["lv-1", "lv-2", "lv-3", "lv-4", "lv-5"];

  function renderLevels(box, words, progress, types, maxLevel) {
    box.innerHTML = "";
    const counts = {};
    types.forEach((t) => {
      counts[t] = { levels: new Array(maxLevel + 1).fill(0), unstarted: 0 };
    });
    words.forEach((w) => {
      const rec = progress[w.id] || {};
      types.forEach((t) => {
        const card = rec[t];
        if (card) counts[t].levels[Math.min(card.level || 0, maxLevel)]++;
        else counts[t].unstarted++;
      });
    });
    const peak = Math.max(1, ...types.flatMap((t) => counts[t].levels));

    const wrap = h("div", "viz-matrix-wrap");
    const table = h("table", "viz-matrix");
    const head = h("tr");
    head.appendChild(h("th", "", ""));
    for (let lv = 0; lv <= maxLevel; lv++) head.appendChild(h("th", "", String(lv)));
    head.appendChild(h("th", "viz-matrix-rest", "안 배움"));
    const thead = h("thead");
    thead.appendChild(head);
    table.appendChild(thead);
    const tbody = h("tbody");
    types.forEach((t) => {
      const row = h("tr");
      row.appendChild(h("th", "viz-matrix-rowhead", TYPE_SHORT[t]));
      counts[t].levels.forEach((n, lv) => {
        const cell = h("td", "", n ? String(n) : "·");
        if (n) {
          const step = Math.min(LEVEL_STEPS.length - 1, Math.floor((n / peak) * LEVEL_STEPS.length));
          cell.classList.add(LEVEL_STEPS[step]);
        } else {
          cell.classList.add("zero");
        }
        tip(cell, `${TYPE_SHORT[t]} · 레벨 ${lv} · ${n}문제`);
        row.appendChild(cell);
      });
      row.appendChild(h("td", "viz-matrix-rest", String(counts[t].unstarted)));
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    box.appendChild(wrap);

    const legend = h("div", "viz-cal-legend");
    legend.appendChild(h("span", "", "적음"));
    LEVEL_STEPS.forEach((cls) => {
      const sw = h("span", `viz-swatch ${cls}`);
      sw.setAttribute("aria-hidden", "true");
      legend.appendChild(sw);
    });
    legend.appendChild(h("span", "", "많음"));
    box.appendChild(legend);
  }

  // ---------- 4. 유형별 정답률 ----------

  function renderAccuracy(box, words, progress, types) {
    box.innerHTML = "";
    types.forEach((t) => {
      let correct = 0;
      let wrong = 0;
      words.forEach((w) => {
        const card = progress[w.id]?.[t];
        if (card) {
          correct += Number(card.correct) || 0;
          wrong += Number(card.wrong) || 0;
        }
      });
      const total = correct + wrong;
      const pct = total ? Math.round((correct / total) * 100) : null;
      const row = h("div", "viz-bar-row");
      row.appendChild(h("span", "viz-bar-label", TYPE_SHORT[t]));
      const track = h("div", "viz-bar-track");
      const fill = h("div", "viz-bar-fill");
      fill.style.width = pct === null ? "0" : `${pct}%`;
      track.appendChild(fill);
      tip(track, total ? `${TYPE_SHORT[t]} · 맞음 ${correct} / 푼 횟수 ${total}` : `${TYPE_SHORT[t]} · 아직 안 풀었어요`);
      row.appendChild(track);
      const value = h("span", "viz-bar-value", pct === null ? "-" : `${pct}%`);
      value.appendChild(h("small", "", total ? ` (${total}회)` : ""));
      row.appendChild(value);
      box.appendChild(row);
    });
  }

  // ---------- 5. 우선 학습 단어 진행률 ----------

  function renderPriority(box, priorityIds, progress, types, isMastered) {
    box.innerHTML = "";
    const ids = [...priorityIds];
    if (!ids.length) {
      box.appendChild(h("p", "viz-note", "우선 학습 단어가 없어요. 프로필 화면의 ⭐ 우선 학습 단어에서 정할 수 있어요."));
      return;
    }
    const recs = ids.map((id) => progress[id] || {});
    const started = recs.filter((r) => types.some((t) => r[t])).length;
    const allTypes = recs.filter((r) => types.every((t) => r[t])).length;
    const mastered = recs.filter((r) => types.every((t) => r[t] && isMastered(r[t]))).length;
    box.append(
      meter("시작한 단어", started, ids.length),
      meter("네 가지 유형을 모두 풀어 본 단어", allTypes, ids.length),
      meter("완전히 외운 단어 (네 유형 모두 레벨 7)", mastered, ids.length)
    );
  }

  // ---------- 6. 자주 틀리는 문제 TOP 10 ----------

  function renderTopWrong(box, words, progress, types) {
    box.innerHTML = "";
    const items = [];
    words.forEach((w) => {
      types.forEach((t) => {
        const card = progress[w.id]?.[t];
        const wrong = Number(card?.wrong) || 0;
        if (wrong > 0) items.push({ w, t, wrong, correct: Number(card.correct) || 0, level: card.level || 0 });
      });
    });
    items.sort((a, b) => b.wrong - a.wrong || a.correct - b.correct || a.level - b.level);
    if (!items.length) {
      box.appendChild(h("p", "viz-note", "아직 틀린 문제가 없어요 👍"));
      return;
    }
    const list = h("ol", "viz-rank");
    items.slice(0, 10).forEach((it) => {
      const li = h("li", "viz-rank-item");
      const main = h("div", "viz-rank-main");
      main.append(h("span", "viz-rank-en", it.w.en), h("span", "viz-rank-ko", it.w.ko));
      const meta = h("div", "viz-rank-meta");
      meta.append(
        h("span", "viz-chip", TYPE_SHORT[it.t]),
        h("span", "", `틀림 ${it.wrong}번`),
        h("span", "viz-muted", `레벨 ${it.level}`)
      );
      li.append(main, meta);
      list.appendChild(li);
    });
    box.appendChild(list);
  }

  function render(ctx) {
    ensureTooltip();
    const today = toDayNum(ctx.todayStr);
    const cards = [];
    ctx.words.forEach((w) => {
      const rec = ctx.progress[w.id];
      if (rec) ctx.types.forEach((t) => rec[t] && cards.push(rec[t]));
    });
    renderStudyDays(document.getElementById("stats-days"), ctx.stats, today);
    renderForecast(document.getElementById("stats-forecast"), cards, today, ctx.dailyCap);
    renderLevels(document.getElementById("stats-levels"), ctx.words, ctx.progress, ctx.types, ctx.maxLevel);
    renderAccuracy(document.getElementById("stats-accuracy-types"), ctx.words, ctx.progress, ctx.types);
    renderPriority(document.getElementById("stats-priority"), ctx.priorityIds, ctx.progress, ctx.types, ctx.isMastered);
    renderTopWrong(document.getElementById("stats-top-wrong"), ctx.words, ctx.progress, ctx.types);
  }

  window.VocabApp.statsView = { render };
})();
