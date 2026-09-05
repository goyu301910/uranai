const signSelect = document.querySelector("#signSelect");
const refreshButton = document.querySelector("#refreshButton");
const dateLabel = document.querySelector("#dateLabel");
const scoreRing = document.querySelector("#scoreRing");
const scoreNumber = document.querySelector("#scoreNumber");
const resultLabel = document.querySelector("#resultLabel");
const signHeading = document.querySelector("#signHeading");
const averageRank = document.querySelector("#averageRank");
const adviceText = document.querySelector("#adviceText");
const luckyColor = document.querySelector("#luckyColor");
const luckyItem = document.querySelector("#luckyItem");
const luckyAction = document.querySelector("#luckyAction");
const sourceCount = document.querySelector("#sourceCount");
const sourceGrid = document.querySelector("#sourceGrid");

let activeDate = todayIso();

function todayIso() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(new Date());
}

function formatJapaneseDate(dateText) {
  const date = new Date(`${dateText}T00:00:00+09:00`);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(date);
}

function setLoading(isLoading) {
  refreshButton.disabled = isLoading;
  refreshButton.querySelector(".refresh-icon").textContent = isLoading ? "…" : "↻";
}

function sourceCard(source) {
  const article = document.createElement("article");
  article.className = "source-card";

  const header = document.createElement("header");
  const titleWrap = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = source.name;
  const type = document.createElement("div");
  type.className = "source-type";
  type.textContent = source.type;
  titleWrap.append(title, type);

  const score = document.createElement("div");
  score.className = `source-score${source.status === "ok" ? "" : " error"}`;
  score.textContent = source.status === "ok"
    ? (source.rank ? `${source.rank}位` : `${source.score}点`)
    : "失敗";
  header.append(titleWrap, score);

  const message = document.createElement("p");
  message.textContent = source.message || "メッセージはありません。";

  const meta = document.createElement("div");
  meta.className = "source-meta";
  const scoreText = document.createElement("span");
  scoreText.textContent = source.status === "ok" ? `換算 ${source.score}点` : "取得できませんでした";
  meta.append(scoreText);
  if (source.url) {
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "元サイト";
    meta.append(link);
  }

  article.append(header, message, meta);
  return article;
}

function render(data) {
  activeDate = data.date;
  dateLabel.textContent = formatJapaneseDate(data.date);
  scoreRing.style.setProperty("--score", data.score);
  scoreNumber.textContent = data.score;
  resultLabel.textContent = data.summary.label;
  signHeading.textContent = `${data.signLabel}の運勢`;
  averageRank.textContent = data.averageRank
    ? `${data.averageRank.toFixed(1)}位 / ${data.rankTotal}`
    : "--";
  adviceText.textContent = data.summary.advice;
  luckyColor.textContent = data.summary.luckyColor;
  luckyItem.textContent = data.summary.luckyItem;
  luckyAction.textContent = data.summary.luckyAction;
  sourceCount.textContent = data.averageRank
    ? `${data.sourceCount}/${data.totalSources} ソース・平均${data.averageRank.toFixed(1)}位`
    : `${data.sourceCount}/${data.totalSources} ソースを平均`;
  sourceGrid.replaceChildren(...data.sources.map(sourceCard));
}

async function loadFortune({ refresh = false } = {}) {
  setLoading(true);
  try {
    const params = new URLSearchParams({
      sign: signSelect.value,
      date: activeDate
    });
    if (refresh) params.set("refresh", "1");
    const response = await fetch(`api/fortune?${params.toString()}`);
    if (!response.ok) throw new Error("fortune api failed");
    render(await response.json());
  } catch {
    try {
      const response = await fetch(`data/fortune.json?cache=${refresh ? Date.now() : "daily"}`);
      if (!response.ok) throw new Error("static fortune data failed");
      const data = await response.json();
      const fortune = data.fortunes?.[signSelect.value];
      if (!fortune) throw new Error("static fortune for sign missing");
      render(fortune);
    } catch {
      resultLabel.textContent = "取得エラー";
      adviceText.textContent = "データを取得できませんでした。しばらくしてから更新してください。";
    }
  } finally {
    setLoading(false);
  }
}

function restoreSettings() {
  const savedSign = localStorage.getItem("fortune.sign");
  if (savedSign) signSelect.value = savedSign;
}

signSelect.addEventListener("change", () => {
  localStorage.setItem("fortune.sign", signSelect.value);
  loadFortune({ refresh: false });
});

refreshButton.addEventListener("click", () => {
  loadFortune({ refresh: true });
});

setInterval(() => {
  const nextDate = todayIso();
  if (nextDate !== activeDate) {
    activeDate = nextDate;
    loadFortune({ refresh: true });
  }
}, 60_000);

restoreSettings();
loadFortune();
