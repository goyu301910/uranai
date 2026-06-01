import http from "node:http";
import https from "node:https";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const configPath = path.join(__dirname, "config", "sources.json");
const port = Number(process.env.PORT || 4173);

const signs = {
  aries: "おひつじ座",
  taurus: "おうし座",
  gemini: "ふたご座",
  cancer: "かに座",
  leo: "しし座",
  virgo: "おとめ座",
  libra: "てんびん座",
  scorpio: "さそり座",
  sagittarius: "いて座",
  capricorn: "やぎ座",
  aquarius: "みずがめ座",
  pisces: "うお座"
};

const signAliases = {
  aries: ["おひつじ座", "牡羊座", "牡羊"],
  taurus: ["おうし座", "牡牛座", "牡牛"],
  gemini: ["ふたご座", "双子座", "双子"],
  cancer: ["かに座", "蟹座", "蟹"],
  leo: ["しし座", "獅子座", "獅子"],
  virgo: ["おとめ座", "乙女座", "乙女"],
  libra: ["てんびん座", "天秤座", "天秤"],
  scorpio: ["さそり座", "蠍座", "蠍"],
  sagittarius: ["いて座", "射手座", "射手"],
  capricorn: ["やぎ座", "山羊座", "山羊"],
  aquarius: ["みずがめ座", "水瓶座", "水瓶"],
  pisces: ["うお座", "魚座", "魚"]
};

const signAliasToKey = new Map(
  Object.entries(signAliases).flatMap(([key, aliases]) => aliases.map((alias) => [alias, key]))
);
const signAliasPattern = Object.values(signAliases)
  .flat()
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join("|");

const cache = new Map();
const sourcePageCache = new Map();
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function todayInZone(timezone = "Asia/Tokyo") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function hashNumber(seed, min = 0, max = 100) {
  const hash = crypto.createHash("sha256").update(seed).digest("hex").slice(0, 8);
  const value = Number.parseInt(hash, 16);
  return min + (value % (max - min + 1));
}

function pick(seed, values) {
  return values[hashNumber(seed, 0, values.length - 1)];
}

function clamp(number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, number));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeDigits(value) {
  return String(value || "").replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10));
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function htmlToText(value) {
  return normalizeDigits(decodeEntities(String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<img\b[^>]*\balt=(["']?)([^"'>]+)\1[^>]*>/gi, "\n$2\n")
    .replace(/<(br|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/(p|div|li|section|article|h[1-6]|tr|dd|dt)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function stripHtml(value) {
  return htmlToText(value)
    .replace(/\s+/g, " ")
    .trim();
}

function pathValue(data, dottedPath) {
  if (!dottedPath) return undefined;
  return dottedPath.split(".").reduce((current, key) => {
    if (current == null) return undefined;
    return current[key];
  }, data);
}

function normalizeScore({ score, rank, rankTotal, stars, text }) {
  const numericScore = Number(score);
  if (Number.isFinite(numericScore)) {
    return clamp(Math.round(numericScore));
  }

  const numericRank = Number(rank);
  const numericTotal = Number(rankTotal || 12);
  if (Number.isFinite(numericRank) && Number.isFinite(numericTotal) && numericTotal > 1) {
    return clamp(Math.round(96 - ((numericRank - 1) / (numericTotal - 1)) * 66));
  }

  const numericStars = Number(stars);
  if (Number.isFinite(numericStars)) {
    return clamp(Math.round(30 + numericStars * 14));
  }

  const sourceText = String(text || "");
  const positive = ["最高", "絶好調", "大吉", "幸運", "好調", "チャンス", "成功", "上昇"];
  const careful = ["注意", "慎重", "停滞", "不安", "波乱", "低調", "迷い", "無理"];
  let textScore = 58;
  for (const word of positive) if (sourceText.includes(word)) textScore += 6;
  for (const word of careful) if (sourceText.includes(word)) textScore -= 6;
  return clamp(textScore);
}

function sourceTimeout(timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timer };
}

function sourceHeaders(source) {
  return {
    "accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "accept-encoding": "identity",
    "accept-language": "ja,en-US;q=0.8,en;q=0.7",
    "user-agent": source.userAgent || "Mozilla/5.0 DailyFortuneBlend/1.0"
  };
}

function fetchTextWithNodeRequest(url, source, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === "https:" ? https : http;
    const request = client.request(parsedUrl, {
      method: "GET",
      timeout: source.timeoutMs || 8000,
      headers: sourceHeaders(source),
      secureOptions: source.allowLegacyTls ? crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT : undefined
    }, (response) => {
      const location = response.headers.location;
      if (location && response.statusCode >= 300 && response.statusCode < 400 && redirectCount < 3) {
        response.resume();
        resolve(fetchTextWithNodeRequest(new URL(location, parsedUrl).toString(), source, redirectCount + 1));
        return;
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      response.setEncoding("utf8");
      let body = "";
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => resolve(body));
    });

    request.on("timeout", () => request.destroy(new Error("request timeout")));
    request.on("error", reject);
    request.end();
  });
}

async function fetchText(url, source, date) {
  const cacheKey = `${date}:${source.id}:${url}`;
  if (sourcePageCache.has(cacheKey)) return sourcePageCache.get(cacheKey);

  const { controller, timer } = sourceTimeout(source.timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: sourceHeaders(source)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    sourcePageCache.set(cacheKey, text);
    return text;
  } catch (error) {
    if (!source.allowLegacyTls) throw error;
    const text = await fetchTextWithNodeRequest(url, source);
    sourcePageCache.set(cacheKey, text);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonSource(source, sign, date) {
  const url = templateUrl(source.url, sign, date);
  const { controller, timer } = sourceTimeout(source.timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "DailyFortuneBlend/1.0" }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const text = pathValue(data, source.textPath) || pathValue(data, source.messagePath);
    const score = normalizeScore({
      score: pathValue(data, source.scorePath),
      rank: pathValue(data, source.rankPath),
      rankTotal: pathValue(data, source.rankTotalPath),
      stars: pathValue(data, source.starsPath),
      text
    });
    const rank = Number(pathValue(data, source.rankPath));
    const rankTotal = Number(pathValue(data, source.rankTotalPath) || source.rankTotal || 12);
    return makeSourceResult(source, score, text || "取得したJSONからスコアを計算しました。", {
      rank: Number.isFinite(rank) ? rank : null,
      rankTotal,
      url
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHtmlSource(source, sign, date) {
  const url = templateUrl(source.url, sign, date);
  const html = await fetchText(url, source, date);
  const scoreMatch = source.scoreRegex ? html.match(new RegExp(source.scoreRegex, "i")) : null;
  const rankMatch = source.rankRegex ? html.match(new RegExp(source.rankRegex, "i")) : null;
  const starsMatch = source.starsRegex ? html.match(new RegExp(source.starsRegex, "i")) : null;
  const textMatch = source.textRegex ? html.match(new RegExp(source.textRegex, "i")) : null;
  const text = stripHtml(textMatch?.[1] || html.slice(0, 1200));
  const rank = Number(rankMatch?.[1]);
  const rankTotal = Number(source.rankTotal || 12);
  const score = normalizeScore({
    score: scoreMatch?.[1],
    rank,
    rankTotal,
    stars: starsMatch?.[1],
    text
  });
  return makeSourceResult(source, score, text || "HTMLページの本文傾向からスコアを計算しました。", {
    rank: Number.isFinite(rank) ? rank : null,
    rankTotal,
    url
  });
}

function canonicalSign(alias) {
  return signAliasToKey.get(String(alias || "").trim());
}

function sourceBlock(text, source) {
  let block = text;
  if (source.blockStartRegex) {
    const startMatch = block.match(new RegExp(source.blockStartRegex, "i"));
    if (startMatch?.index != null) block = block.slice(startMatch.index);
  }
  if (source.blockEndRegex) {
    const endMatch = block.match(new RegExp(source.blockEndRegex, "i"));
    if (endMatch?.index != null) block = block.slice(0, endMatch.index);
  }
  return block;
}

function extractRankingEntries(block, source) {
  const rankRegex = new RegExp(`(?:^|[\\s#*>:：・【】\\-–—])(?:第)?([1-9]|1[0-2])\\s*位\\s*(?:[#\\s:：・【】\\-–—]*)(${signAliasPattern})`, "g");
  const signFirstRegex = new RegExp(`(?:^|[\\s#*>:：・【】\\-–—])(${signAliasPattern})(?:[\\s\\S]{0,160}?)(?:今日\\s*)?(?:第)?([1-9]|1[0-2])\\s*位`, "g");
  const bareSignRankRegex = source.allowBareSignRank
    ? new RegExp(`(?:^|[\\s#*>:：・【】\\-–—])(${signAliasPattern})\\s+([1-9]|1[0-2])(?=\\s)`, "g")
    : null;
  const rawEntries = [];
  for (const regex of [rankRegex, bareSignRankRegex, signFirstRegex].filter(Boolean)) {
    let match;
    while ((match = regex.exec(block)) != null) {
      const isRankFirst = regex === rankRegex;
      const rank = Number(isRankFirst ? match[1] : match[2]);
      const sign = canonicalSign(isRankFirst ? match[2] : match[1]);
      if (!sign) continue;
      rawEntries.push({
        sign,
        rank,
        rankTotal: Number(source.rankTotal || 12),
        index: match.index,
        end: regex.lastIndex,
        pattern: isRankFirst ? "rank-first" : (regex === bareSignRankRegex ? "bare-sign-rank" : "sign-first")
      });
    }
  }

  rawEntries.sort((a, b) => a.index - b.index);
  const uniqueEntries = [];
  const seenSigns = new Map();
  for (const entry of rawEntries) {
    const existingIndex = seenSigns.get(entry.sign);
    if (existingIndex != null) {
      const existing = uniqueEntries[existingIndex];
      const priority = { "rank-first": 3, "bare-sign-rank": 2, "sign-first": 1 };
      if (priority[entry.pattern] > priority[existing.pattern]) {
        uniqueEntries[existingIndex] = entry;
      }
      continue;
    }
    seenSigns.set(entry.sign, uniqueEntries.length);
    uniqueEntries.push(entry);
    if (uniqueEntries.length >= Number(source.rankTotal || 12)) break;
  }
  return { rawEntries, uniqueEntries };
}

function entryMessage(block, rawEntries, entry) {
  const nextEntry = rawEntries.find((candidate) => candidate.index > entry.index && candidate.sign !== entry.sign);
  const snippet = block
    .slice(entry.end, nextEntry?.index ?? entry.end + 360)
    .split(/続きを読む|もっと見る|Read More/i)[0];
  return snippet
    .replace(new RegExp(`^\\s*(?:${signAliasPattern})?\\s*\\d{1,2}[/-]\\d{1,2}\\s*[～~〜-]\\s*\\d{1,2}[/-]\\d{1,2}\\s*`), "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

async function fetchRankedHtmlSource(source, sign, date) {
  const url = templateUrl(source.url, sign, date);
  const html = await fetchText(url, source, date);
  const block = sourceBlock(htmlToText(html), source);
  const { rawEntries, uniqueEntries } = extractRankingEntries(block, source);
  const entry = uniqueEntries.find((candidate) => candidate.sign === sign);
  if (!entry) {
    throw new Error("ランキングから該当星座を見つけられませんでした。");
  }

  const message = entryMessage(block, rawEntries, entry) || `${signs[sign]}は${entry.rank}位でした。`;
  const score = normalizeScore({ rank: entry.rank, rankTotal: entry.rankTotal, text: message });
  return makeSourceResult(source, score, message, {
    rank: entry.rank,
    rankTotal: entry.rankTotal,
    url
  });
}

function templateUrl(url, sign, date) {
  return String(url || "")
    .replaceAll("{sign}", encodeURIComponent(sign))
    .replaceAll("{signLabel}", encodeURIComponent(signs[sign] || sign))
    .replaceAll("{date}", encodeURIComponent(date));
}

function makeStaticSource(source, sign, date) {
  const seed = `${source.id}:${sign}:${date}`;
  const score = hashNumber(seed, 42, 96);
  const tones = [
    "勢いを使うより、順番を整えると運が乗ります。",
    "人との会話から小さな追い風が入ってきそうです。",
    "今日は選択肢を減らすほど、判断が軽くなります。",
    "焦らず一つずつ片づけると、午後に流れが変わります。",
    "気になっていたことを確認すると、余白が戻ります。"
  ];
  return makeSourceResult(source, score, pick(seed, tones));
}

function makeSourceResult(source, score, message, details = {}) {
  const scoreValue = Number(score);
  return {
    id: source.id,
    name: source.name,
    score: Number.isFinite(scoreValue) ? clamp(Math.round(scoreValue)) : null,
    rank: Number.isFinite(Number(details.rank)) ? Number(details.rank) : null,
    rankTotal: Number.isFinite(Number(details.rankTotal)) ? Number(details.rankTotal) : Number(source.rankTotal || 12),
    weight: Number(source.weight || 1),
    message: String(message || "").slice(0, 180),
    status: "ok",
    type: source.type,
    url: details.url || null
  };
}

async function readConfig() {
  const raw = await readFile(configPath, "utf8");
  const config = JSON.parse(raw);
  return {
    timezone: config.timezone || "Asia/Tokyo",
    sources: Array.isArray(config.sources) ? config.sources : []
  };
}

async function fetchSource(source, sign, date) {
  if (source.type === "static") return makeStaticSource(source, sign, date);
  if (source.type === "json") return fetchJsonSource(source, sign, date);
  if (source.type === "html") return fetchHtmlSource(source, sign, date);
  if (source.type === "ranked-html") return fetchRankedHtmlSource(source, sign, date);
  throw new Error(`Unknown source type: ${source.type}`);
}

function summarize(score, sign, date) {
  const seed = `${sign}:${date}:${score}`;
  const label =
    score >= 85 ? "大吉" :
    score >= 72 ? "好調" :
    score >= 58 ? "安定" :
    score >= 44 ? "調整" :
    "慎重";

  const colors = ["コーラル", "ミント", "ゴールド", "ラベンダー", "シルバー", "ターコイズ", "ホワイト"];
  const items = ["細いペン", "温かい飲み物", "小さなメモ", "歩きやすい靴", "明るいハンカチ", "読みかけの本"];
  const actions = ["朝の予定を一つ減らす", "感謝を短く伝える", "机の上を整える", "気になる連絡を先に返す", "少し遠回りして歩く"];
  const advice =
    score >= 72 ? "今日は前向きな選択が平均的に強く出ています。小さく動き出すほど流れをつかみやすい日です。" :
    score >= 58 ? "全体は落ち着いた日です。予定を詰めすぎず、確実に終わる順番から進めると運気を保てます。" :
    "今日は慎重さが味方になります。即決を避け、確認と休憩をはさむと結果が安定します。";

  return {
    label,
    advice,
    luckyColor: pick(`${seed}:color`, colors),
    luckyItem: pick(`${seed}:item`, items),
    luckyAction: pick(`${seed}:action`, actions)
  };
}

async function buildFortune(sign, date, refresh = false) {
  const config = await readConfig();
  const requestedDate = date || todayInZone(config.timezone);
  const requestedSign = signs[sign] ? sign : "aries";
  const cacheKey = `${requestedDate}:${requestedSign}`;
  if (!refresh && cache.has(cacheKey)) return cache.get(cacheKey);

  const enabledSources = config.sources.filter((source) => source.enabled !== false);
  const settled = await Promise.allSettled(enabledSources.map((source) => fetchSource(source, requestedSign, requestedDate)));
  const results = settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    const source = enabledSources[index];
    return {
      id: source.id,
      name: source.name,
      score: null,
      rank: null,
      rankTotal: Number(source.rankTotal || 12),
      weight: Number(source.weight || 1),
      message: result.reason?.message || "取得できませんでした。",
      status: "error",
      type: source.type,
      url: source.url || null
    };
  });

  const usable = results.filter((result) => result.status === "ok" && Number.isFinite(result.score));
  const ranked = usable.filter((result) => Number.isFinite(result.rank));
  const weightedTotal = usable.reduce((sum, result) => sum + result.score * result.weight, 0);
  const weightTotal = usable.reduce((sum, result) => sum + result.weight, 0);
  const rankWeightTotal = ranked.reduce((sum, result) => sum + result.weight, 0);
  const averageRank = rankWeightTotal > 0
    ? Math.round((ranked.reduce((sum, result) => sum + result.rank * result.weight, 0) / rankWeightTotal) * 10) / 10
    : null;
  const rankTotal = ranked[0]?.rankTotal || 12;
  const score = weightTotal > 0 ? Math.round(weightedTotal / weightTotal) : 50;
  const payload = {
    date: requestedDate,
    timezone: config.timezone,
    sign: requestedSign,
    signLabel: signs[requestedSign],
    score,
    averageRank,
    rankCount: ranked.length,
    rankTotal,
    sourceCount: usable.length,
    totalSources: enabledSources.length,
    summary: summarize(score, requestedSign, requestedDate),
    sources: results,
    generatedAt: new Date().toISOString()
  };
  cache.set(cacheKey, payload);
  return payload;
}

async function serveStatic(req, res, pathname) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const requestedPath = path.normalize(path.join(publicDir, cleanPath));
  if (!requestedPath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(requestedPath);
    const ext = path.extname(requestedPath);
    res.writeHead(200, {
      "content-type": mimeTypes[ext] || "application/octet-stream",
      "cache-control": ext === ".html" ? "no-store" : "public, max-age=3600"
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === "/api/fortune") {
        const sign = url.searchParams.get("sign") || "aries";
        const date = url.searchParams.get("date") || undefined;
        const refresh = url.searchParams.get("refresh") === "1";
        return json(res, 200, await buildFortune(sign, date, refresh));
      }

      if (url.pathname === "/api/sources") {
        const config = await readConfig();
        return json(res, 200, {
          timezone: config.timezone,
          sources: config.sources.map(({ id, name, type, enabled, weight, note }) => ({ id, name, type, enabled, weight, note }))
        });
      }

      if (url.pathname === "/health") {
        return json(res, 200, { ok: true, today: todayInZone() });
      }

      return serveStatic(req, res, url.pathname);
    } catch (error) {
      return json(res, 500, { error: error.message || "Unexpected server error" });
    }
  });
}

if (process.argv[1] === __filename) {
  const server = createServer();
  server.listen(port, () => {
    console.log(`Daily Fortune Blend running at http://localhost:${port}`);
  });
}

export { buildFortune, createServer, readConfig, signs, todayInZone };
