import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.use(express.static(path.join(__dirname, "dist")));

let cachedNews = null;
let cachedAt = 0;

const CACHE_TIME = 30 * 60 * 1000;

function formatTime(publishedAt) {
  const published = new Date(publishedAt);
  const now = new Date();
  const diffMinutes = Math.floor((now - published) / 60000);

  if (diffMinutes < 60) {
    return `${Math.max(diffMinutes, 1)}분 전`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}시간 전`;
  }

  return `${Math.floor(diffHours / 24)}일 전`;
}

function getCategory(article) {
  const text = `${article.title || ""} ${article.description || ""}`.toLowerCase();

  if (
    /ai|인공지능|반도체|삼성|애플|구글|마이크로소프트|테크|it|컴퓨터|스마트폰|로봇|소프트웨어/.test(
      text,
    )
  ) {
    return "IT";
  }

  if (
    /경제|증시|주식|코스피|코스닥|금리|은행|대출|부동산|아파트|기업|채권|환율|원화|달러|물가/.test(
      text,
    )
  ) {
    return "경제";
  }

  if (
    /미국|중국|일본|북한|러시아|우크라이나|유럽|이스라엘|이란|유엔|트럼프|시진핑|국제/.test(
      text,
    )
  ) {
    return "국제";
  }

  if (
    /사회|경찰|검찰|법원|사건|사고|교육|학교|병원|복지|노동|범죄|재판/.test(
      text,
    )
  ) {
    return "사회";
  }

  return "종합";
}

async function getNews() {
  const apiKey = process.env.GNEWS_API_KEY;

  if (!apiKey) {
    throw new Error("GNEWS_API_KEY가 설정되지 않았습니다.");
  }

  const url =
    `https://gnews.io/api/v4/top-headlines` +
    `?country=kr&lang=ko&max=10&apikey=${apiKey}`;

  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();

    console.error("GNews 오류:", response.status, errorText);

    throw new Error(`GNews API 오류: ${response.status}`);
  }

  const data = await response.json();
  const articles = Array.isArray(data.articles) ? data.articles : [];

  return articles.slice(0, 10).map((article, index) => ({
    id: index + 1,
    title: article.title || "제목 없음",
    summary: article.description || "요약 정보가 없습니다.",
    category: getCategory(article),
    time: formatTime(article.publishedAt),
    source: article.source?.name || "뉴스 출처",
    url: article.url,
  }));
}

app.get("/api/news", async (req, res) => {
  try {
    const now = Date.now();

    if (cachedNews && now - cachedAt < CACHE_TIME) {
      return res.json(cachedNews);
    }

    const news = await getNews();

    cachedNews = news;
    cachedAt = now;

    res.json(news);
  } catch (error) {
    console.error(error);

    if (cachedNews) {
      return res.json(cachedNews);
    }

    res.status(500).json({
      error: "뉴스를 가져오는 중 오류가 발생했습니다.",
    });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`뉴스 서버 실행: ${PORT}`);
});