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
  if (!publishedAt) {
    return "시간 정보 없음";
  }

  const published = new Date(publishedAt);

  if (Number.isNaN(published.getTime())) {
    return "시간 정보 없음";
  }

  return published.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getCategory(article) {
  const text =
    `${article.title || ""} ${article.description || ""}`.toLowerCase();

  // 정치
  if (
    /정치|대통령|국회|여당|야당|선거|총선|대선|정당|국무|정부|장관|의원|공천|탄핵|법안/.test(
      text,
    )
  ) {
    return "정치";
  }

  // 경제
  if (
    /경제|증시|주식|코스피|코스닥|금리|은행|대출|부동산|아파트|기업|채권|환율|원화|달러|물가|투자|재테크|금융/.test(
      text,
    )
  ) {
    return "경제";
  }

  // IT
  if (
    /ai|인공지능|반도체|삼성|애플|구글|마이크로소프트|테크|it|컴퓨터|스마트폰|로봇|소프트웨어|갤럭시|아이폰|챗gpt|오픈ai/.test(
      text,
    )
  ) {
    return "IT";
  }

  // 국제
  if (
    /미국|중국|일본|북한|러시아|우크라이나|유럽|이스라엘|이란|유엔|트럼프|시진핑|국제|외교|전쟁|중동|나토/.test(
      text,
    )
  ) {
    return "국제";
  }

  // 스포츠
  if (
    /스포츠|축구|야구|농구|배구|골프|손흥민|김민재|이강인|류현진|월드컵|올림픽|프로야구|k리그|경기|선수|감독/.test(
      text,
    )
  ) {
    return "스포츠";
  }

  // 연예
  if (
    /연예|배우|가수|아이돌|방탄소년단|bts|블랙핑크|드라마|영화|예능|콘서트|앨범|음원|배우|스타|연예인/.test(
      text,
    )
  ) {
    return "연예";
  }

  // 과학
  if (
    /과학|우주|나사|NASA|천문|연구|실험|바이오|유전자|의학|신약|기후|지구|생명|물리|화학|과학기술/.test(
      text,
    )
  ) {
    return "과학";
  }

  // 사회
  if (
    /사회|경찰|검찰|법원|사건|사고|교육|학교|병원|복지|노동|범죄|재판|안전|소방|교통/.test(
      text,
    )
  ) {
    return "사회";
  }

  // 생활
  if (
    /생활|건강|여행|맛집|음식|날씨|주거|육아|쇼핑|문화|패션|자동차|반려동물|취미/.test(
      text,
    )
  ) {
    return "생활";
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
    `?country=kr&lang=ko&max=100&apikey=${apiKey}`;

  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();

    console.error("GNews 오류:", response.status, errorText);

    throw new Error(`GNews API 오류: ${response.status}`);
  }

  const data = await response.json();

  const articles = Array.isArray(data.articles) ? data.articles : [];

  const news = articles.map((article, index) => ({
    id: index + 1,
    title: article.title || "제목 없음",
    summary: article.description || "요약 정보가 없습니다.",
    category: getCategory(article),
    time: formatTime(article.publishedAt),
    publishedAt: article.publishedAt || null,
    source: article.source?.name || "뉴스 출처",
    url: article.url,
    image: article.image || null,
  }));

  return news;
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

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`뉴스 서버 실행: ${PORT}`);
});
