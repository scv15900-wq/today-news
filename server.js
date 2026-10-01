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

// 30분 캐시
const CACHE_TIME = 30 * 60 * 1000;

/* -------------------------
   기사 데이터 정리
------------------------- */

function makeNewsItem(article, category, id) {
  return {
    id,
    title: article.title || "제목 없음",
    summary: article.description || "요약 정보가 없습니다.",
    category,
    source: article.source?.name || "뉴스 출처",
    url: article.url || "",
    image: article.image || null,
    publishedAt: article.publishedAt || null,
  };
}

/* -------------------------
   GNews 요청 공통 함수
------------------------- */

async function requestGNews(endpoint, params, categoryName) {
  try {
    const apiKey = process.env.GNEWS_API_KEY;

    const searchParams = new URLSearchParams({
      ...params,
      lang: "ko",
      country: "kr",
      max: "10",
      apikey: apiKey,
    });

    const url =
      `https://gnews.io/api/v4/${endpoint}?` +
      searchParams.toString();

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        `[${categoryName}] GNews 오류`,
        response.status,
        errorText
      );

      return [];
    }

    const data = await response.json();

    if (!Array.isArray(data.articles)) {
      return [];
    }

    return data.articles;
  } catch (error) {
    console.error(
      `[${categoryName}] 뉴스 요청 실패:`,
      error.message
    );

    // 한 카테고리가 실패해도
    // 전체 서버는 죽지 않음
    return [];
  }
}

/* -------------------------
   GNews 카테고리 뉴스
------------------------- */

async function fetchCategory(
  gnewsCategory,
  appCategory
) {
  return requestGNews(
    "top-headlines",
    {
      category: gnewsCategory,
    },
    appCategory
  );
}

/* -------------------------
   검색 기반 뉴스
------------------------- */

async function fetchSearch(
  query,
  appCategory
) {
  return requestGNews(
    "search",
    {
      q: query,
      sortby: "publishedAt",
    },
    appCategory
  );
}

/* -------------------------
   전체 뉴스 가져오기
------------------------- */

async function getNews() {
  if (!process.env.GNEWS_API_KEY) {
    throw new Error(
      "GNEWS_API_KEY가 설정되지 않았습니다."
    );
  }

  const results = await Promise.all([
    // 정치
    fetchSearch(
      "정치 OR 대통령 OR 국회 OR 정부 OR 정당",
      "정치"
    ),

    // 경제
    fetchCategory(
      "business",
      "경제"
    ),

    // 사회
    fetchSearch(
      "사회 OR 사건 OR 사고 OR 경찰 OR 법원",
      "사회"
    ),

    // IT
    fetchCategory(
      "technology",
      "IT"
    ),

    // 국제
    fetchCategory(
      "world",
      "국제"
    ),

    // 스포츠
    fetchCategory(
      "sports",
      "스포츠"
    ),

    // 연예
    fetchCategory(
      "entertainment",
      "연예"
    ),

    // 과학
    fetchCategory(
      "science",
      "과학"
    ),

    // 생활
    fetchCategory(
      "health",
      "생활"
    ),
  ]);

  const categoryNames = [
    "정치",
    "경제",
    "사회",
    "IT",
    "국제",
    "스포츠",
    "연예",
    "과학",
    "생활",
  ];

  const news = [];

  let id = 1;

  results.forEach((articles, index) => {
    const category =
      categoryNames[index];

    const seenUrls = new Set();

    for (const article of articles) {
      if (news.filter(
        (item) =>
          item.category === category
      ).length >= 10) {
        break;
      }

      if (!article.url) {
        continue;
      }

      // 같은 카테고리 안의 중복 제거
      if (seenUrls.has(article.url)) {
        continue;
      }

      seenUrls.add(article.url);

      news.push(
        makeNewsItem(
          article,
          category,
          id
        )
      );

      id += 1;
    }
  });

  console.log("----------------------");

  categoryNames.forEach(
    (category) => {
      const count = news.filter(
        (item) =>
          item.category === category
      ).length;

      console.log(
        `${category}: ${count}개`
      );
    }
  );

  console.log(
    `전체 뉴스: ${news.length}개`
  );

  console.log("----------------------");

  return news;
}

/* -------------------------
   API
------------------------- */

app.get(
  "/api/news",
  async (req, res) => {
    try {
      const now = Date.now();

      // 30분 이내면 캐시 사용
      if (
        cachedNews &&
        now - cachedAt < CACHE_TIME
      ) {
        return res.json(cachedNews);
      }

      const news = await getNews();

      /*
        일부 카테고리가 실패하더라도
        성공한 뉴스는 정상 반환
      */

      if (news.length > 0) {
        cachedNews = news;
        cachedAt = now;

        return res.json(news);
      }

      /*
        새 요청이 전부 실패했는데
        이전 캐시가 있으면 이전 뉴스 사용
      */

      if (cachedNews) {
        return res.json(cachedNews);
      }

      return res.status(503).json({
        error:
          "현재 뉴스 데이터를 가져올 수 없습니다.",
      });
    } catch (error) {
      console.error(
        "뉴스 서버 오류:",
        error
      );

      if (cachedNews) {
        return res.json(cachedNews);
      }

      res.status(500).json({
        error:
          "뉴스를 가져오는 중 오류가 발생했습니다.",
      });
    }
  }
);

/* -------------------------
   React 앱
------------------------- */

app.use((req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "dist",
      "index.html"
    )
  );
});

/* -------------------------
   서버 시작
------------------------- */

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `뉴스 서버 실행: ${PORT}`
    );
  }
);